import { Worker, Queue, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
// AI agent types — inlined to avoid cross-package import issues in dev
// In production, these would come from @replyforce/ai-agents package

interface PipelineConfig {
  openaiApiKey: string;
  primaryModel: string;
  fastModel: string;
  maxTokens: number;
  temperature: number;
  enableCaching: boolean;
  cacheThreshold: number;
}

interface AgentInput {
  messageId: string;
  tenantId: string;
  conversationId: string;
  channelType: 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'TWITTER';
  message: {
    text: string;
    contentType: string;
    mediaUrl?: string;
    senderId: string;
    senderName?: string;
    timestamp: number;
  };
  conversationHistory: Array<{
    role: 'contact' | 'ai_bot' | 'human_agent';
    content: string;
    timestamp: number;
  }>;
  brandVoice: {
    companyName: string;
    tone: string;
    style: string;
    guidelines?: string;
    knowledgeBase?: string;
    maxReplyLength: number;
    useEmojis: boolean;
    language: string;
  };
  existingLead?: {
    id: string;
    tag: string;
    score: number;
    signals: string[];
  };
}

interface AgentOutput {
  guardrailInput: { passed: boolean; flags: string[]; riskScore: number };
  understanding: { language: string; entities: any[]; topic: string; isQuestion: boolean; summary: string; keyPhrases: string[] };
  sentiment: { sentiment: string; score: number; urgency: string; emotions: string[] };
  leadScore: { intent: string; confidence: number; score: number; tag: 'HOT' | 'WARM' | 'COLD'; signals: string[]; recommendedAction: string };
  reply: { text: string; confidence: number; requiresHuman: boolean; suggestedActions: string[]; tokensUsed: number };
  guardrailOutput: { passed: boolean; flags: string[]; riskScore: number };
  processingTimeMs: number;
  tokensUsed: number;
}

// Dynamic import of orchestrator — resolves at runtime
let AgentOrchestrator: any;
try {
  AgentOrchestrator = require('../../../ai-agents/src/orchestrator/orchestrator').AgentOrchestrator;
} catch {
  // Fallback: orchestrator not available, will use mock
  AgentOrchestrator = null;
}
import Redis from 'ioredis';

/**
 * Inbound Message Processor
 * 
 * This is the CORE worker that processes every incoming social media message:
 * 1. Receives message from inbound.messages queue
 * 2. Resolves tenant, channel, contact, and conversation context
 * 3. Runs the full AI agent pipeline
 * 4. Persists results (message, lead update, AI analysis)
 * 5. Queues outbound reply and CRM sync
 * 6. Publishes real-time updates via Redis pub/sub
 */
export class InboundMessageProcessor {
  private worker: Worker | null = null;
  private outboundQueue: Queue;
  private crmQueue: Queue;
  private prisma: PrismaClient;
  private redis: Redis;
  private orchestrator: any;

  constructor(private redisUrl: string) {
    this.outboundQueue = new Queue('outbound.messages', { connection: { url: redisUrl } });
    this.crmQueue = new Queue('crm.sync', { connection: { url: redisUrl } });
    this.prisma = new PrismaClient();
    this.redis = new Redis(redisUrl);

    // Initialize AI orchestrator
    const config: PipelineConfig = {
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      primaryModel: process.env.OPENAI_MODEL_PRIMARY || 'gpt-4o',
      fastModel: process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      enableCaching: true,
      cacheThreshold: 0.95,
    };

    if (AgentOrchestrator) {
      this.orchestrator = new AgentOrchestrator(config);
    } else {
      console.warn('⚠️  AI Agent orchestrator not available — using mock pipeline');
      this.orchestrator = { process: async () => this.buildFallbackOutput() };
    }
  }

  async start(): Promise<void> {
    this.worker = new Worker(
      'inbound.messages',
      async (job: Job) => this.processMessage(job),
      {
        connection: { url: this.redisUrl },
        concurrency: parseInt(process.env.QUEUE_AI_CONCURRENCY || '10'),
        limiter: {
          max: 50,
          duration: 60000, // 50 jobs per minute per worker
        },
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`✅ Message processed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Message processing failed: ${job?.id}`, err.message);
    });

    console.log('📥 Inbound message processor started');
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.prisma.$disconnect();
    await this.redis.quit();
  }

  /**
   * Core message processing logic.
   */
  private async processMessage(job: Job): Promise<void> {
    const data = job.data;
    const { channel, senderId, recipientId, text, platformMessageId, contentType, mediaUrl } = data;

    console.log(`Processing message: ${platformMessageId} from ${channel}`);

    // ── Step 1: Resolve channel and tenant ──
    const channelRecord = await this.prisma.channel.findFirst({
      where: { platformPageId: recipientId, type: channel, status: 'ACTIVE' },
      include: { tenant: true },
    });

    if (!channelRecord) {
      console.warn(`No active channel found for ${channel}:${recipientId}`);
      return;
    }

    const tenantId = channelRecord.tenantId;

    // ── Step 2: Resolve or create contact ──
    let contact = await this.prisma.contact.findFirst({
      where: { tenantId, platformId: senderId, channel },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          tenantId,
          platformId: senderId,
          channel,
          name: `${channel} User`, // Will be enriched later
        },
      });
    }

    // ── Step 3: Resolve or create conversation ──
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        channelId: channelRecord.id,
        contactId: contact.id,
        status: { in: ['OPEN', 'NEEDS_HUMAN'] },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId,
          channelId: channelRecord.id,
          contactId: contact.id,
          status: 'OPEN',
        },
      });
    }

    // ── Step 4: Save inbound message ──
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'CONTACT',
        content: text,
        contentType: contentType || 'TEXT',
        platformMsgId: platformMessageId,
        mediaUrl,
      },
    });

    // ── Step 5: Get conversation history ──
    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const conversationHistory = recentMessages.reverse().map(m => ({
      role: m.senderType === 'CONTACT' ? 'contact' as const
        : m.senderType === 'AI_BOT' ? 'ai_bot' as const
        : 'human_agent' as const,
      content: m.content,
      timestamp: m.createdAt.getTime(),
    }));

    // ── Step 6: Get brand voice ──
    const brandVoice = await this.prisma.brandVoice.findUnique({
      where: { tenantId },
    });

    // ── Step 7: Get existing lead (if any) ──
    const existingLead = await this.prisma.lead.findFirst({
      where: { tenantId, contactId: contact.id },
    });

    // ── Step 8: Check token budget ──
    const budget = await this.prisma.tokenBudget.findUnique({
      where: { tenantId },
    });

    if (budget && budget.hardCap && budget.currentDailyUsage >= budget.dailyLimit) {
      console.warn(`Token budget exceeded for tenant ${tenantId}`);
      // Still process but use templates only
    }

    // ── Step 9: Run AI Agent Pipeline ──
    const agentInput: AgentInput = {
      messageId: message.id,
      tenantId,
      conversationId: conversation.id,
      channelType: channel,
      message: {
        text,
        contentType: contentType || 'TEXT',
        mediaUrl,
        senderId,
        senderName: contact.name || undefined,
        timestamp: data.timestamp,
      },
      conversationHistory,
      brandVoice: {
        companyName: brandVoice?.companyName || channelRecord.tenant.name,
        tone: brandVoice?.tone || 'professional',
        style: brandVoice?.style || 'helpful',
        guidelines: brandVoice?.guidelines || undefined,
        knowledgeBase: brandVoice?.knowledgeBase || undefined,
        maxReplyLength: brandVoice?.maxReplyLength || 500,
        useEmojis: brandVoice?.useEmojis || false,
        language: brandVoice?.language || 'en',
      },
      existingLead: existingLead
        ? {
            id: existingLead.id,
            tag: existingLead.tag,
            score: existingLead.score,
            signals: existingLead.signals as string[],
          }
        : undefined,
    };

    let aiOutput: AgentOutput;
    try {
      aiOutput = await this.orchestrator.process(agentInput);
    } catch (error) {
      console.error('AI pipeline failed:', error);
      // Use minimal fallback
      aiOutput = this.buildFallbackOutput();
    }

    // ── Step 10: Update message with AI analysis ──
    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        aiAnalysis: {
          understanding: aiOutput.understanding,
          sentiment: aiOutput.sentiment,
          leadScore: aiOutput.leadScore,
          guardrail: aiOutput.guardrailInput,
        } as any,
        aiConfidence: aiOutput.reply.confidence,
      },
    });

    // ── Step 11: Upsert lead ──
    const lead = await this.prisma.lead.upsert({
      where: { contactId: contact.id },
      update: {
        tag: aiOutput.leadScore.tag,
        score: aiOutput.leadScore.score,
        signals: aiOutput.leadScore.signals as any,
        intent: aiOutput.leadScore.intent,
        confidence: aiOutput.leadScore.confidence,
      },
      create: {
        tenantId,
        contactId: contact.id,
        tag: aiOutput.leadScore.tag,
        score: aiOutput.leadScore.score,
        signals: aiOutput.leadScore.signals as any,
        intent: aiOutput.leadScore.intent,
        confidence: aiOutput.leadScore.confidence,
      },
    });

    // Update conversation with lead reference
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        leadId: lead.id,
        lastMessageAt: new Date(),
        lastMessagePreview: text.substring(0, 200),
        messageCount: { increment: 1 },
        status: aiOutput.reply.requiresHuman ? 'NEEDS_HUMAN' : 'OPEN',
      },
    });

    // ── Step 12: Queue outbound reply (if auto-reply enabled and not blocked) ──
    if (
      channelRecord.autoReplyEnabled &&
      aiOutput.reply.text &&
      !aiOutput.reply.requiresHuman &&
      aiOutput.guardrailInput.passed
    ) {
      await this.outboundQueue.add('send-reply', {
        tenantId,
        conversationId: conversation.id,
        channelId: channelRecord.id,
        channelType: channel,
        recipientId: senderId,
        replyText: aiOutput.reply.text,
        platformPageId: recipientId,
      });

      // Save AI reply message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'AI_BOT',
          content: aiOutput.reply.text,
          contentType: 'TEXT',
          isAutoReply: true,
          aiConfidence: aiOutput.reply.confidence,
        },
      });

      // Update conversation message count
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { messageCount: { increment: 1 } },
      });
    }

    // ── Step 13: Queue CRM sync ──
    await this.crmQueue.add('sync-lead', {
      tenantId,
      leadId: lead.id,
      contact: {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      },
      leadTag: aiOutput.leadScore.tag,
      leadScore: aiOutput.leadScore.score,
      conversationSummary: aiOutput.understanding.summary,
      channel,
      signals: aiOutput.leadScore.signals,
    });

    // ── Step 14: Publish real-time updates ──
    const updatePayload = JSON.stringify({
      tenantId,
      event: 'message.new',
      payload: {
        conversationId: conversation.id,
        messageId: message.id,
        contactName: contact.name,
        preview: text.substring(0, 100),
        channel,
        leadTag: aiOutput.leadScore.tag,
        autoReplied: !aiOutput.reply.requiresHuman && channelRecord.autoReplyEnabled,
      },
    });

    await this.redis.publish('broadcast:conversations', updatePayload);
    await this.redis.publish(`tenant:${tenantId}:conversations`, updatePayload);

    // ── Step 15: Update token usage ──
    if (aiOutput.tokensUsed > 0 && budget) {
      await this.prisma.tokenBudget.update({
        where: { tenantId },
        data: {
          currentDailyUsage: { increment: aiOutput.tokensUsed },
          currentMonthlyUsage: { increment: aiOutput.tokensUsed },
        },
      });
    }

    console.log(
      `Processed: ${platformMessageId} | Lead: ${aiOutput.leadScore.tag} (${aiOutput.leadScore.score}) | ` +
      `Reply: ${aiOutput.reply.requiresHuman ? 'HUMAN' : 'AI'} | ${aiOutput.processingTimeMs}ms`,
    );
  }

  private buildFallbackOutput(): AgentOutput {
    return {
      guardrailInput: { passed: true, flags: ['pipeline_fallback'], riskScore: 0 },
      understanding: {
        language: 'en', entities: [], topic: 'other',
        isQuestion: false, summary: 'Processing failed', keyPhrases: [],
      },
      sentiment: { sentiment: 'neutral', score: 0, urgency: 'medium', emotions: [] },
      leadScore: {
        intent: 'unknown', confidence: 0.3, score: 20, tag: 'COLD',
        signals: ['pipeline_fallback'], recommendedAction: 'monitor',
      },
      reply: {
        text: '', confidence: 0, requiresHuman: true,
        suggestedActions: ['escalate_to_human'], tokensUsed: 0,
      },
      guardrailOutput: { passed: true, flags: [], riskScore: 0 },
      processingTimeMs: 0,
      tokensUsed: 0,
    };
  }
}
