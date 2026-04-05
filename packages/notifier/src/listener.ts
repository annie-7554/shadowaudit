import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import { CVEDiff } from './diff';
import { WebhookSender } from './webhook';
import type { ScanCompletedEvent } from './types';

const SCAN_RESULTS_QUEUE = 'scan-results';

export function createListener(connection: IORedis): Worker<ScanCompletedEvent> {
  const diff = new CVEDiff();
  const webhook = new WebhookSender();

  const worker = new Worker<ScanCompletedEvent>(
    SCAN_RESULTS_QUEUE,
    async (job: Job<ScanCompletedEvent>) => {
      const { targetId, scanId, vulnerabilities } = job.data;

      console.log(
        `[Listener] Processing scan.completed for target=${targetId} scanId=${scanId} totalVulns=${vulnerabilities.length}`,
      );

      const newHighSeverity = await diff.findNew(targetId, vulnerabilities);

      if (newHighSeverity.length === 0) {
        console.log(`[Listener] No new HIGH/CRITICAL vulns for target ${targetId}`);
        return;
      }

      console.log(
        `[Listener] Found ${newHighSeverity.length} new HIGH/CRITICAL vulns for target ${targetId}, sending webhook`,
      );

      await webhook.send(targetId, newHighSeverity);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err: Error) => {
    console.error(`[Listener] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err: Error) => {
    console.error('[Listener] Worker error:', err.message);
  });

  return worker;
}
