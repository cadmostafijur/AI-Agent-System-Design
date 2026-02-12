import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * List conversations for a tenant with pagination and filters.
   */
  async listConversations(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      channelId?: string;
      assignedToId?: string;
      search?: string;
    },
  ) {
    const { page = 1, limit = 20, status, channelId, assignedToId, search } = options;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (channelId) where.channelId = channelId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { lastMessagePreview: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: { select: { id: true, name: true, avatarUrl: true, channel: true } },
          channel: { select: { id: true, type: true, name: true } },
          lead: { select: { id: true, tag: true, score: true } },
          assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single conversation with recent messages.
   */
  async getConversation(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        contact: true,
        channel: { select: { id: true, type: true, name: true } },
        lead: true,
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Reverse messages for chronological order
    conversation.messages.reverse();

    return conversation;
  }

  /**
   * Get paginated messages for a conversation.
   */
  async getMessages(
    tenantId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    // Verify conversation belongs to tenant
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      items: items.reverse(),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Assign a conversation to a human agent.
   */
  async assignConversation(tenantId: string, conversationId: string, agentId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        assignedToId: agentId,
        isAiHandled: false,
        status: 'OPEN',
      },
    });

    // Notify via WebSocket
    await this.redis.publish(
      `tenant:${tenantId}:conversations`,
      JSON.stringify({
        type: 'conversation.assigned',
        conversationId,
        agentId,
      }),
    );

    return updated;
  }

  /**
   * Update conversation status.
   */
  async updateStatus(tenantId: string, conversationId: string, status: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: status as any },
    });

    await this.redis.publish(
      `tenant:${tenantId}:conversations`,
      JSON.stringify({
        type: 'conversation.status_changed',
        conversationId,
        status,
      }),
    );

    return updated;
  }

  /**
   * Send a manual reply from a human agent.
   */
  async sendManualReply(
    tenantId: string,
    conversationId: string,
    agentId: string,
    content: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: { channel: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Create message record
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: 'HUMAN_AGENT',
        content,
        contentType: 'TEXT',
        isAutoReply: false,
      },
    });

    // Update conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: content.substring(0, 200),
        messageCount: { increment: 1 },
      },
    });

    // TODO: Queue message for delivery to the social platform
    // This would go through the outbound.messages queue

    // Notify via WebSocket
    await this.redis.publish(
      `tenant:${tenantId}:conversations`,
      JSON.stringify({
        type: 'message.sent',
        conversationId,
        message,
      }),
    );

    return message;
  }
}
