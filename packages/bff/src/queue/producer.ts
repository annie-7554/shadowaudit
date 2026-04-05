import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { TargetType } from '../types';

interface ScanJobData {
  targetId: string;
  type: TargetType;
  value: string;
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  console.error('[queue] Redis connection error:', err.message);
});

export const scanQueue = new Queue<ScanJobData>('scan-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export async function addScanJob(
  targetId: string,
  type: TargetType,
  value: string,
): Promise<void> {
  await scanQueue.add(
    'scan',
    { targetId, type, value },
    { jobId: `scan-${targetId}-${Date.now()}` },
  );
  console.log(`[queue] Enqueued scan job for target ${targetId} (${type})`);
}
