import { Injectable, Logger } from '@nestjs/common';
import { CrmSyncPayload } from '../crm.service';

/**
 * HubSpot CRM Adapter.
 * Handles contact creation/update and deal creation in HubSpot.
 */
@Injectable()
export class HubSpotAdapter {
  private readonly logger = new Logger(HubSpotAdapter.name);
  private readonly baseUrl = 'https://api.hubapi.com';

  /**
   * Sync a contact to HubSpot.
   * Creates or updates a contact and optionally creates a deal for HOT leads.
   */
  async syncContact(crmConfig: any, payload: CrmSyncPayload): Promise<string> {
    const accessToken = crmConfig.accessToken; // Should be decrypted before passing

    // Map lead data to HubSpot fields
    const contactProperties = this.mapToHubSpotFields(crmConfig.fieldMapping, payload);

    // Search for existing contact by email
    let contactId: string | null = null;
    if (payload.contact.email) {
      contactId = await this.findContactByEmail(accessToken, payload.contact.email);
    }

    if (contactId) {
      // Update existing contact
      await this.updateContact(accessToken, contactId, contactProperties);
      this.logger.log(`Updated HubSpot contact ${contactId}`);
    } else {
      // Create new contact
      contactId = await this.createContact(accessToken, contactProperties);
      this.logger.log(`Created HubSpot contact ${contactId}`);
    }

    // Create a deal for HOT leads
    if (payload.leadTag === 'HOT') {
      await this.createDeal(accessToken, contactId, payload);
    }

    // Add a note with conversation summary
    await this.createNote(accessToken, contactId, payload.conversationSummary);

    return contactId;
  }

  private mapToHubSpotFields(fieldMapping: any, payload: CrmSyncPayload): Record<string, string> {
    const defaultMapping: Record<string, string> = {
      email: payload.contact.email || '',
      firstname: payload.contact.name?.split(' ')[0] || '',
      lastname: payload.contact.name?.split(' ').slice(1).join(' ') || '',
      phone: payload.contact.phone || '',
      hs_lead_status: this.mapLeadTag(payload.leadTag),
      lead_source: payload.channel,
    };

    // Apply custom field mapping if configured
    if (fieldMapping && typeof fieldMapping === 'object') {
      for (const [hubspotField, sourceField] of Object.entries(fieldMapping)) {
        if (typeof sourceField === 'string' && sourceField in payload) {
          defaultMapping[hubspotField] = (payload as any)[sourceField];
        }
      }
    }

    return defaultMapping;
  }

  private mapLeadTag(tag: string): string {
    const mapping: Record<string, string> = {
      HOT: 'QUALIFIED',
      WARM: 'IN_PROGRESS',
      COLD: 'NEW',
    };
    return mapping[tag] || 'NEW';
  }

  private async findContactByEmail(accessToken: string, email: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/crm/v3/objects/contacts/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
            }],
          }),
        },
      );
      const data = await response.json() as any;
      return data.results?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  private async createContact(accessToken: string, properties: Record<string, string>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      throw new Error(`HubSpot create contact failed: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.id;
  }

  private async updateContact(accessToken: string, contactId: string, properties: Record<string, string>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      throw new Error(`HubSpot update contact failed: ${response.status}`);
    }
  }

  private async createDeal(accessToken: string, contactId: string, payload: CrmSyncPayload): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/crm/v3/objects/deals`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            dealname: `${payload.contact.name} - ${payload.channel} Lead`,
            pipeline: 'default',
            dealstage: 'qualifiedtobuy',
            description: payload.conversationSummary,
          },
          associations: [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
          }],
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to create deal in HubSpot: ${error.message}`);
    }
  }

  private async createNote(accessToken: string, contactId: string, content: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/crm/v3/objects/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: content,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          }],
        }),
      });
    } catch (error) {
      this.logger.warn(`Failed to create note in HubSpot: ${error.message}`);
    }
  }
}
