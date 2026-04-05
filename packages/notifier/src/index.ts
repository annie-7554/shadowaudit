import 'dotenv/config';
import IORedis from 'ioredis';
import { pool } from './db/client';
import { createListener } from './listener';

async function main(): Promise<void> {
  console.log('[Notifier] Starting ShadowAudit Notifier Service');

  const dbClient = await pool.connect();
  dbClient.release();
  console.log('[Notifier] PostgreSQL connection established');

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  connection.on('connect', () => console.log('[Notifier] Redis connection established'));
  connection.on('error', (err: Error) => console.error('[Notifier] Redis error:', err.message));

  const worker = createListener(connection);
  console.log('[Notifier] BullMQ listener started, consuming queue: scan-results');

  async function shutdown(signal: string): Promise<void> {
    console.log(`[Notifier] Received ${signal}, shutting down gracefully…`);
    await worker.close();
    await connection.quit();
    await pool.end();
    console.log('[Notifier] Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: Error) => {
  console.error('[Notifier] Fatal startup error:', err.message);
  process.exit(1);
});
