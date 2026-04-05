import 'dotenv/config';
import IORedis from 'ioredis';
import { pool } from './db/client';
import { createWorker } from './worker';

async function main(): Promise<void> {
  console.log('[Scanner] Starting ShadowAudit Scanner Service');

  // Verify DB connectivity
  const dbClient = await pool.connect();
  dbClient.release();
  console.log('[Scanner] PostgreSQL connection established');

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  connection.on('connect', () => console.log('[Scanner] Redis connection established'));
  connection.on('error', (err: Error) => console.error('[Scanner] Redis error:', err.message));

  const worker = createWorker(connection);
  console.log('[Scanner] BullMQ worker started, listening on queue: scan-jobs');

  async function shutdown(signal: string): Promise<void> {
    console.log(`[Scanner] Received ${signal}, shutting down gracefully…`);
    await worker.close();
    await connection.quit();
    await pool.end();
    console.log('[Scanner] Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: Error) => {
  console.error('[Scanner] Fatal startup error:', err.message);
  process.exit(1);
});
