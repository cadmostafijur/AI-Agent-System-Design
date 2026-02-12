import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HubSpotAdapter } from './adapters/hubspot.adapter';
import { SalesforceAdapter } from './adapters/salesforce.adapter';

export interface CrmSyncPayload {
  tenantId: string;
  leadId: string;
  contact: {
    name: string;
    email?: string;
    phone?: string;
  };
  leadTag: string;
  leadScore: number;
  conversationSummary: string;
  channel: string;
  signals: string[];
}

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private prisma: PrismaService,
    private hubspot: HubSpotAdapter,
    private salesforce: SalesforceAdapter,
  ) {}

  /**
   * Sync a lead to the configured CRM.
   */
  async syncLead(payload: CrmSyncPayload): Promise<void> {
    const crmConfig = await this.prisma.crmConfig.findFirst({
      where: { tenantId: payload.tenantId, syncEnabled: true },
    });

    if (!crmConfig) {
      this.logger.debug(`No CRM configured for tenant ${payload.tenantId}`);
      return;
    }

    // Create sync record
    const syncRecord = await this.prisma.crmSync.create({
      data: {
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        crmType: crmConfig.crmType,
        status: 'IN_PROGRESS',
        payload: payload as any,
        attempts: 1,
        lastAttempt: new Date(),
      },
    });

    try {
      let crmRecordId: string;

      switch (crmConfig.crmType) {
        case 'HUBSPOT':
          crmRecordId = await this.hubspot.syncContact(crmConfig, payload);
          break;
        case 'SALESFORCE':
          crmRecordId = await this.salesforce.syncLead(crmConfig, payload);
          break;
        default:
          throw new Error(`Unsupported CRM: ${crmConfig.crmType}`);
      }

      // Update sync record
      await this.prisma.crmSync.update({
        where: { id: syncRecord.id },
        data: {
          status: 'SUCCESS',
          crmRecordId,
          response: { crmRecordId } as any,
        },
      });

      // Update lead with CRM record ID
      await this.prisma.lead.update({
        where: { id: payload.leadId },
        data: { crmSynced: true, crmRecordId },
      });

      this.logger.log(`CRM sync successful: lead ${payload.leadId} → ${crmConfig.crmType} record ${crmRecordId}`);
    } catch (error) {
      await this.prisma.crmSync.update({
        where: { id: syncRecord.id },
        data: {
          status: 'FAILED',
          error: error.message,
        },
      });

      this.logger.error(`CRM sync failed for lead ${payload.leadId}: ${error.message}`);
      throw error; // Let the queue handle retry
    }
  }

  /**
   * Get CRM integration status for a tenant.
   */
  async getIntegrations(tenantId: string) {
    return this.prisma.crmConfig.findMany({
      where: { tenantId },
      select: {
        id: true,
        crmType: true,
        syncEnabled: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get sync queue status.
   */
  async getSyncStatus(tenantId: string) {
    const [pending, failed, success, total] = await Promise.all([
      this.prisma.crmSync.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.crmSync.count({ where: { tenantId, status: 'FAILED' } }),
      this.prisma.crmSync.count({ where: { tenantId, status: 'SUCCESS' } }),
      this.prisma.crmSync.count({ where: { tenantId } }),
    ]);

    return { pending, failed, success, total };
  }
}
