import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * List leads with filtering, sorting, and pagination.
   */
  async listLeads(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      tag?: string;
      minScore?: number;
      maxScore?: number;
      crmSynced?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const {
      page = 1,
      limit = 20,
      tag,
      minScore,
      maxScore,
      crmSynced,
      sortBy = 'score',
      sortOrder = 'desc',
    } = options;

    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (tag) where.tag = tag;
    if (minScore !== undefined) where.score = { ...where.score, gte: minScore };
    if (maxScore !== undefined) where.score = { ...where.score, lte: maxScore };
    if (crmSynced !== undefined) where.crmSynced = crmSynced;

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          contact: {
            select: { id: true, name: true, email: true, phone: true, avatarUrl: true, channel: true },
          },
          conversations: {
            select: { id: true, status: true, lastMessageAt: true, messageCount: true },
            orderBy: { lastMessageAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get lead detail with full history.
   */
  async getLeadDetail(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        contact: true,
        conversations: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 10 },
            channel: { select: { type: true, name: true } },
          },
          orderBy: { lastMessageAt: 'desc' },
        },
        crmSyncs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  /**
   * Manually override a lead tag (by human agent).
   */
  async updateLeadTag(tenantId: string, leadId: string, tag: string, userId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        tag: tag as any,
        signals: {
          ...(lead.signals as any),
          manual_override: { by: userId, at: new Date().toISOString(), previous_tag: lead.tag },
        },
      },
    });

    // Notify dashboard
    await this.redis.publish(
      `tenant:${tenantId}:leads`,
      JSON.stringify({ type: 'lead.tag_updated', leadId, tag }),
    );

    return updated;
  }

  /**
   * Get lead statistics for the dashboard.
   */
  async getLeadStats(tenantId: string) {
    const [total, hot, warm, cold, crmSynced, recentHot] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'HOT' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'WARM' } }),
      this.prisma.lead.count({ where: { tenantId, tag: 'COLD' } }),
      this.prisma.lead.count({ where: { tenantId, crmSynced: true } }),
      this.prisma.lead.findMany({
        where: { tenantId, tag: 'HOT' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          contact: { select: { name: true, avatarUrl: true } },
        },
      }),
    ]);

    return {
      total,
      byTag: { hot, warm, cold },
      crmSynced,
      conversionRate: total > 0 ? ((hot / total) * 100).toFixed(1) : '0',
      recentHotLeads: recentHot,
    };
  }
}
