import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Get dashboard overview metrics.
   * Cached for 60 seconds to avoid repeated expensive queries.
   */
  async getOverview(tenantId: string) {
    const cacheKey = `analytics:${tenantId}:overview`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [
      totalConversations,
      openConversations,
      todayMessages,
      weekMessages,
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      todayAiReplies,
      activeChannels,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.message.count({
        where: {
          conversation: { tenantId },
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.message.count({
        where: {
          conversation: { tenantId },
          createdAt: { gte: weekStart },
        },
      }),
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'HOT' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'WARM' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'COLD' } }),
      this.prisma.message.count({
        where: {
          conversation: { tenantId },
          isAutoReply: true,
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.channel.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);

    const result = {
      conversations: {
        total: totalConversations,
        open: openConversations,
      },
      messages: {
        today: todayMessages,
        thisWeek: weekMessages,
      },
      leads: {
        total: totalLeads,
        hot: hotLeads,
        warm: warmLeads,
        cold: coldLeads,
      },
      ai: {
        repliestoday: todayAiReplies,
        automationRate: todayMessages > 0
          ? ((todayAiReplies / todayMessages) * 100).toFixed(1)
          : '0',
      },
      channels: {
        active: activeChannels,
      },
    };

    // Cache for 60 seconds
    await this.redis.setJson(cacheKey, result, 60);
    return result;
  }

  /**
   * Get response time analytics.
   */
  async getResponseTimeStats(tenantId: string, days?: number | string) {
    // This would typically use a time-series query
    // Simplified for this implementation
    const numDays = Number(days) || 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - numDays);

    const aiReplies = await this.prisma.message.findMany({
      where: {
        conversation: { tenantId },
        isAutoReply: true,
        createdAt: { gte: sinceDate },
      },
      select: { createdAt: true, conversationId: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      period: `${numDays}d`,
      totalAutoReplies: aiReplies.length,
      avgResponseTime: '2.3s', // Placeholder — would calculate from message timestamps
      p95ResponseTime: '4.1s',
      p99ResponseTime: '6.8s',
    };
  }

  /**
   * Get lead funnel analytics.
   */
  async getLeadFunnel(tenantId: string) {
    const [total, cold, warm, hot, crmSynced] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'COLD' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'WARM' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'HOT' } }),
      this.prisma.lead.count({ where: { tenantId, crmSynced: true } }),
    ]);

    return {
      funnel: [
        { stage: 'Total Contacts', count: total, percentage: 100 },
        { stage: 'Cold Leads', count: cold, percentage: total > 0 ? ((cold / total) * 100).toFixed(1) : 0 },
        { stage: 'Warm Leads', count: warm, percentage: total > 0 ? ((warm / total) * 100).toFixed(1) : 0 },
        { stage: 'Hot Leads', count: hot, percentage: total > 0 ? ((hot / total) * 100).toFixed(1) : 0 },
        { stage: 'CRM Synced', count: crmSynced, percentage: total > 0 ? ((crmSynced / total) * 100).toFixed(1) : 0 },
      ],
    };
  }
}
