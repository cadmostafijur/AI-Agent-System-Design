import { Injectable, Logger } from '@nestjs/common';
import { CrmSyncPayload } from '../crm.service';

/**
 * Salesforce CRM Adapter.
 * Handles Lead creation and Task creation in Salesforce.
 */
@Injectable()
export class SalesforceAdapter {
  private readonly logger = new Logger(SalesforceAdapter.name);

  async syncLead(crmConfig: any, payload: CrmSyncPayload): Promise<string> {
    const { accessToken, instanceUrl } = crmConfig;

    // Map to Salesforce Lead fields
    const leadData = {
      FirstName: payload.contact.name?.split(' ')[0] || '',
      LastName: payload.contact.name?.split(' ').slice(1).join(' ') || 'Unknown',
      Email: payload.contact.email || '',
      Phone: payload.contact.phone || '',
      LeadSource: this.mapChannel(payload.channel),
      Status: this.mapLeadTag(payload.leadTag),
      Description: payload.conversationSummary,
      Rating: payload.leadTag === 'HOT' ? 'Hot' : payload.leadTag === 'WARM' ? 'Warm' : 'Cold',
    };

    // Search for existing lead by email
    let leadId = await this.findLeadByEmail(accessToken, instanceUrl, payload.contact.email);

    if (leadId) {
      await this.updateLead(accessToken, instanceUrl, leadId, leadData);
    } else {
      leadId = await this.createLead(accessToken, instanceUrl, leadData);
    }

    // Create a Task for follow-up
    await this.createTask(accessToken, instanceUrl, leadId, payload);

    return leadId;
  }

  private mapChannel(channel: string): string {
    const mapping: Record<string, string> = {
      FACEBOOK: 'Social Media - Facebook',
      INSTAGRAM: 'Social Media - Instagram',
      WHATSAPP: 'Social Media - WhatsApp',
      TWITTER: 'Social Media - Twitter',
    };
    return mapping[channel] || 'Social Media';
  }

  private mapLeadTag(tag: string): string {
    const mapping: Record<string, string> = {
      HOT: 'Qualified',
      WARM: 'Working - Contacted',
      COLD: 'Open - Not Contacted',
    };
    return mapping[tag] || 'Open - Not Contacted';
  }

  private async findLeadByEmail(accessToken: string, instanceUrl: string, email?: string): Promise<string | null> {
    if (!email) return null;
    try {
      const query = encodeURIComponent(`SELECT Id FROM Lead WHERE Email = '${email}' LIMIT 1`);
      const response = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json() as any;
      return data.records?.[0]?.Id || null;
    } catch {
      return null;
    }
  }

  private async createLead(accessToken: string, instanceUrl: string, leadData: any): Promise<string> {
    const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(leadData),
    });

    if (!response.ok) throw new Error(`Salesforce create failed: ${response.status}`);
    const data = await response.json() as any;
    return data.id;
  }

  private async updateLead(accessToken: string, instanceUrl: string, leadId: string, leadData: any): Promise<void> {
    const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(leadData),
    });

    if (!response.ok) throw new Error(`Salesforce update failed: ${response.status}`);
  }

  private async createTask(accessToken: string, instanceUrl: string, leadId: string, payload: CrmSyncPayload): Promise<void> {
    try {
      await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Task`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          WhoId: leadId,
          Subject: `Follow up - ${payload.channel} conversation`,
          Description: payload.conversationSummary,
          Priority: payload.leadTag === 'HOT' ? 'High' : 'Normal',
          Status: 'Not Started',
          ActivityDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to create Salesforce task: ${error.message}`);
    }
  }
}
