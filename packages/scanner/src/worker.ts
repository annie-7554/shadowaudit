import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import { TrivyRunner } from './trivy/runner';
import { ResultsStore } from './db/results';
import type { ScanJobData, ScanCompletedEvent } from './types';

const SCAN_JOBS_QUEUE = 'scan-jobs';
const SCAN_RESULTS_QUEUE = 'scan-results';

export function createWorker(connection: IORedis): Worker<ScanJobData> {
  const resultsQueue = new Queue<ScanCompletedEvent>(SCAN_RESULTS_QUEUE, { connection });
  const store = new ResultsStore();

  const worker = new Worker<ScanJobData>(
    SCAN_JOBS_QUEUE,
    async (job: Job<ScanJobData>) => {
      const { targetId, type, value } = job.data;

      console.log(`[Worker] Starting job ${job.id} — target=${targetId} type=${type} value=${value}`);

      await job.updateProgress(10);

      const trivyOutput = await TrivyRunner.scan(type, value);
      const allVulns = [
        ...trivyOutput.mainScan,
        ...trivyOutput.configScan,
        ...trivyOutput.secretScan,
      ];

      await job.updateProgress(70);

      await store.save(targetId, allVulns);

      await job.updateProgress(90);

      const event: ScanCompletedEvent = {
        targetId,
        scanId: job.id ?? `${targetId}-${Date.now()}`,
        vulnerabilities: allVulns,
      };

      await resultsQueue.add('scan.completed', event, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      await job.updateProgress(100);

      console.log(
        `[Worker] Job ${job.id} complete — ${allVulns.length} vulns found for target ${targetId}`,
      );
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err: Error) => {
    console.error('[Worker] Worker error:', err.message);
  });

  return worker;
}
