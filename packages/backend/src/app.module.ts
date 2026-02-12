import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { LeadsModule } from './modules/leads/leads.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { CrmModule } from './modules/crm/crm.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WebSocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // Configuration — loads .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // Rate limiting — protects all endpoints
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 1000,
      limit: 10,
    }, {
      name: 'medium',
      ttl: 60000,
      limit: 100,
    }, {
      name: 'long',
      ttl: 3600000,
      limit: 1000,
    }]),

    // Scheduled tasks (token budget reset, health checks)
    ScheduleModule.forRoot(),

    // Database (Prisma + Redis)
    DatabaseModule,

    // Feature modules
    AuthModule,
    ChannelsModule,
    ConversationsModule,
    LeadsModule,
    WebhooksModule,
    CrmModule,
    AnalyticsModule,
    SettingsModule,
    WebSocketModule,
  ],
})
export class AppModule {}
