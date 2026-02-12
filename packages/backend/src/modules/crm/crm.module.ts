import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { HubSpotAdapter } from './adapters/hubspot.adapter';
import { SalesforceAdapter } from './adapters/salesforce.adapter';

@Module({
  controllers: [CrmController],
  providers: [CrmService, HubSpotAdapter, SalesforceAdapter],
  exports: [CrmService],
})
export class CrmModule {}
