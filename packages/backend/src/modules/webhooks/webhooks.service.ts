import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

interface ParsedMessage {
  platformMessageId: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: number;
  channel: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TWITTER';
  mediaUrl?: string;
  contentType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private inboundQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.inboundQueue = new Queue('inbound.messages', {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  /**
   * Enqueue a webhook event for async processing.
   * This method must be fast (<100ms) because we need to ACK the webhook immediately.
   */
  async enqueueWebhookEvent(
    channel: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TWITTER',
    payload: any,
  ): Promise<void> {
    try {
      const messages = this.parseWebhookPayload(channel, payload);

      for (const message of messages) {
        // Deduplication check
        const dedupKey = `dedup:${channel}:${message.platformMessageId}`;
        const isDuplicate = await this.redis.isDuplicate(dedupKey, 86400);

        if (isDuplicate) {
          this.logger.warn(`Duplicate webhook event: ${dedupKey}`);
          continue;
        }

        // Log webhook event
        await this.prisma.webhookEvent.create({
          data: {
            channel,
            platformId: message.platformMessageId,
            eventType: 'message.received',
            payload: payload as any,
          },
        });

        // Enqueue for processing
        await this.inboundQueue.add(
          'process-message',
          {
            ...message,
            receivedAt: Date.now(),
          },
          {
            priority: 1, // High priority
            jobId: `msg-${channel}-${message.platformMessageId}`,
          },
        );

        this.logger.log(
          `Enqueued message: ${message.platformMessageId} from ${channel}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to enqueue webhook event for ${channel}: ${error.message}`,
        error.stack,
      );
      // Don't throw — we already ACKed the webhook
    }
  }

  /**
   * Parse platform-specific webhook payloads into a normalized format.
   */
  private parseWebhookPayload(channel: string, payload: any): ParsedMessage[] {
    switch (channel) {
      case 'FACEBOOK':
      case 'INSTAGRAM':
        return this.parseFacebookPayload(payload, channel as any);
      case 'WHATSAPP':
        return this.parseWhatsAppPayload(payload);
      case 'TWITTER':
        return this.parseTwitterPayload(payload);
      default:
        this.logger.warn(`Unknown channel: ${channel}`);
        return [];
    }
  }

  private parseFacebookPayload(payload: any, channel: 'FACEBOOK' | 'INSTAGRAM'): ParsedMessage[] {
    const messages: ParsedMessage[] = [];

    if (payload.object !== 'page' && payload.object !== 'instagram') return messages;

    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message) continue; // Skip read receipts, typing indicators

        messages.push({
          platformMessageId: event.message.mid,
          senderId: event.sender.id,
          recipientId: event.recipient.id,
          text: event.message.text || '',
          timestamp: event.timestamp,
          channel,
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          contentType: event.message.attachments?.[0]?.type === 'image'
            ? 'IMAGE'
            : event.message.attachments?.[0]?.type === 'video'
              ? 'VIDEO'
              : 'TEXT',
        });
      }
    }

    return messages;
  }

  private parseWhatsAppPayload(payload: any): ParsedMessage[] {
    const messages: ParsedMessage[] = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        for (const msg of value.messages || []) {
          messages.push({
            platformMessageId: msg.id,
            senderId: msg.from,
            recipientId: value.metadata?.phone_number_id || '',
            text: msg.text?.body || msg.caption || '',
            timestamp: parseInt(msg.timestamp) * 1000,
            channel: 'WHATSAPP',
            mediaUrl: msg.image?.id || msg.video?.id || msg.audio?.id || undefined,
            contentType: msg.type === 'image' ? 'IMAGE'
              : msg.type === 'video' ? 'VIDEO'
              : msg.type === 'audio' ? 'AUDIO'
              : 'TEXT',
          });
        }
      }
    }

    return messages;
  }

  private parseTwitterPayload(payload: any): ParsedMessage[] {
    const messages: ParsedMessage[] = [];

    for (const event of payload.direct_message_events || []) {
      if (event.type !== 'message_create') continue;

      const msgData = event.message_create;
      messages.push({
        platformMessageId: event.id,
        senderId: msgData.sender_id,
        recipientId: msgData.target.recipient_id,
        text: msgData.message_data.text || '',
        timestamp: parseInt(event.created_timestamp),
        channel: 'TWITTER',
        mediaUrl: msgData.message_data.attachment?.media?.media_url_https,
        contentType: msgData.message_data.attachment?.type === 'media'
          ? 'IMAGE'
          : 'TEXT',
      });
    }

    return messages;
  }
}
