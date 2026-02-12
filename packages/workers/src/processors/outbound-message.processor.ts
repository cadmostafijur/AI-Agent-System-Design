import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';

/**
 * Outbound Message Processor
 * 
 * Sends AI-generated replies back to the social media platform.
 * Handles platform-specific API calls with rate limiting and retry.
 */
export class OutboundMessageProcessor {
  private worker: Worker | null = null;
  private prisma: PrismaClient;

  constructor(private redisUrl: string) {
    this.prisma = new PrismaClient();
  }

  async start(): Promise<void> {
    this.worker = new Worker(
      'outbound.messages',
      async (job: Job) => this.sendMessage(job),
      {
        connection: { url: this.redisUrl },
        concurrency: parseInt(process.env.QUEUE_OUTBOUND_CONCURRENCY || '15'),
        limiter: {
          max: 30,
          duration: 60000, // Rate limit: 30 sends per minute
        },
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`📤 Reply sent: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Reply send failed: ${job?.id}`, err.message);
    });

    console.log('📤 Outbound message processor started');
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.prisma.$disconnect();
  }

  private async sendMessage(job: Job): Promise<void> {
    const { channelType, recipientId, replyText, channelId, platformPageId } = job.data;

    // Get channel access token
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.status !== 'ACTIVE') {
      throw new Error(`Channel ${channelId} not active`);
    }

    // Decrypt access token (simplified — use TokenVaultService in production)
    const accessToken = channel.accessTokenEnc; // Should be decrypted

    switch (channelType) {
      case 'FACEBOOK':
      case 'INSTAGRAM':
        await this.sendFacebookMessage(accessToken, recipientId, replyText, platformPageId);
        break;
      case 'WHATSAPP':
        await this.sendWhatsAppMessage(accessToken, recipientId, replyText);
        break;
      case 'TWITTER':
        await this.sendTwitterMessage(accessToken, recipientId, replyText);
        break;
      default:
        throw new Error(`Unsupported channel: ${channelType}`);
    }
  }

  private async sendFacebookMessage(token: string, recipientId: string, text: string, pageId: string): Promise<void> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE',
          access_token: token,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook API error: ${response.status} - ${error}`);
    }
  }

  private async sendWhatsAppMessage(token: string, recipientId: string, text: string): Promise<void> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientId,
          type: 'text',
          text: { body: text },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
    }
  }

  private async sendTwitterMessage(token: string, recipientId: string, text: string): Promise<void> {
    const response = await fetch(
      'https://api.twitter.com/2/dm_conversations/with/' + recipientId + '/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter API error: ${response.status} - ${error}`);
    }
  }
}
