import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getBrandVoice(tenantId: string) {
    const brandVoice = await this.prisma.brandVoice.findUnique({
      where: { tenantId },
    });
    if (!brandVoice) throw new NotFoundException('Brand voice not configured');
    return brandVoice;
  }

  async updateBrandVoice(tenantId: string, data: any) {
    return this.prisma.brandVoice.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, companyName: data.companyName || 'My Company', ...data },
    });
  }

  async getTeamMembers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTenantSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        brandVoice: true,
        tokenBudget: true,
        _count: {
          select: { channels: true, users: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}
