import * as dotenv from 'dotenv';
dotenv.config();

import { InboundMessageProcessor } from './processors/inbound-message.processor';
import { OutboundMessageProcessor } from './processors/outbound-message.processor';
import { CrmSyncProcessor } from './processors/crm-sync.processor';

/**
 * Worker Entry Point
 * 
 * Starts all queue processors. Each processor handles a specific
 * stage of the message processing pipeline:
 * 
 * 1. InboundMessageProcessor  — Dequeues inbound messages, runs AI pipeline
 * 2. OutboundMessageProcessor — Sends AI replies back to social platforms
 * 3. CrmSyncProcessor         — Syncs lead data to CRM
 */
async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  console.log('🔄 Starting ReplyForce AI Workers...');
  console.log(`📡 Redis: ${redisUrl}`);

  // Start processors
  const inbound = new InboundMessageProcessor(redisUrl);
  const outbound = new OutboundMessageProcessor(redisUrl);
  const crm = new CrmSyncProcessor(redisUrl);

  await Promise.all([
    inbound.start(),
    outbound.start(),
    crm.start(),
  ]);

  console.log('✅ All workers started successfully');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down workers...');
    await Promise.all([
      inbound.stop(),
      outbound.stop(),
      crm.stop(),
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('❌ Worker startup failed:', error);
  process.exit(1);
});
