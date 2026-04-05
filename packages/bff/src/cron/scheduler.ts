import cron from 'node-cron';
import { targetsRepository } from '../db/targets';
import { addScanJob } from '../queue/producer';

async function runReschedule(): Promise<void> {
  console.log('[cron] Starting scheduled re-scan cycle...');
  try {
    const targets = await targetsRepository.findAll();
    if (targets.length === 0) {
      console.log('[cron] No targets found, skipping.');
      return;
    }
    await Promise.all(
      targets.map((target) => addScanJob(target.id, target.type, target.value)),
    );
    console.log(`[cron] Queued ${targets.length} re-scan job(s).`);
  } catch (err) {
    console.error('[cron] Error during scheduled re-scan:', err);
  }
}

export function startScheduler(): void {
  // Every 24 hours at midnight
  cron.schedule('0 0 * * *', () => {
    void runReschedule();
  });
  console.log('[cron] Scheduler started — re-scans every 24 hours.');
}
