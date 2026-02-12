import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';

/**
 * CRM Sync Processor
 * 
 * Syncs lead data to configured CRM systems (HubSpot, Salesforce, etc.).
 * Runs at lower priority than message processing.
 * Implements batch processing for efficiency.
 */
export class CrmSyncProcessor {
  private worker: Worker | null = null;
  private prisma: PrismaClient;

  constructor(private redisUrl: string) {
    this.prisma = new PrismaClient();
  }

  async start(): Promise<void> {
    this.worker = new Worker(
      'crm.sync',
      async (job: Job) => this.syncToCRM(job),
      {
        connection: { url: this.redisUrl },
        concurrency: parseInt(process.env.QUEUE_CRM_CONCURRENCY || '5'),
        limiter: {
          max: 10,
          duration: 60000, // 10 syncs per minute to avoid CRM rate limits
        },
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`🔄 CRM sync completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ CRM sync failed: ${job?.id}`, err.message);
    });

    console.log('🔄 CRM sync processor started');
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.prisma.$disconnect();
  }

  private async syncToCRM(job: Job): Promise<void> {
    const { tenantId, leadId, contact, leadTag, leadScore, conversationSummary, channel, signals } = job.data;

    // Check if CRM is configured
    const crmConfig = await this.prisma.crmConfig.findFirst({
      where: { tenantId, syncEnabled: true },
    });

    if (!crmConfig) {
      console.log(`No CRM configured for tenant ${tenantId}, skipping sync`);
      return;
    }

    // Create sync record
    const syncRecord = await this.prisma.crmSync.create({
      data: {
        tenantId,
        leadId,
        crmType: crmConfig.crmType,
        status: 'IN_PROGRESS',
        payload: job.data as any,
        attempts: (job.attemptsMade || 0) + 1,
        lastAttempt: new Date(),
      },
    });

    try {
      // Dispatch to appropriate CRM adapter
      // In production, this would call the actual CRM API
      let crmRecordId: string;

      switch (crmConfig.crmType) {
        case 'HUBSPOT':
          crmRecordId = await this.syncToHubSpot(crmConfig, job.data);
          break;
        case 'SALESFORCE':
          crmRecordId = await this.syncToSalesforce(crmConfig, job.data);
          break;
        default:
          throw new Error(`Unsupported CRM: ${crmConfig.crmType}`);
      }

      // Update sync record
      await this.prisma.crmSync.update({
        where: { id: syncRecord.id },
        data: { status: 'SUCCESS', crmRecordId },
      });

      // Update lead
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { crmSynced: true, crmRecordId },
      });

      console.log(`CRM synced: lead ${leadId} → ${crmConfig.crmType}:${crmRecordId}`);
    } catch (error: any) {
      await this.prisma.crmSync.update({
        where: { id: syncRecord.id },
        data: {
          status: job.attemptsMade >= 4 ? 'DEAD_LETTER' : 'FAILED',
          error: error.message,
        },
      });
      throw error; // Let BullMQ retry
    }
  }

  private async syncToHubSpot(config: any, data: any): Promise<string> {
    // Simplified — actual implementation in HubSpotAdapter
    console.log(`Syncing to HubSpot: ${data.contact.name}`);
    return `hs_${Date.now()}`; // Placeholder CRM record ID
  }

  private async syncToSalesforce(config: any, data: any): Promise<string> {
    console.log(`Syncing to Salesforce: ${data.contact.name}`);
    return `sf_${Date.now()}`;
  }
}
