import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookValidator } from './webhook-validator.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookValidator],
  exports: [WebhooksService],
})
export class WebhooksModule {}
