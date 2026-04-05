import app from './app';
import { connectDb, pool } from './db/client';
import { scanQueue } from './queue/producer';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main(): Promise<void> {
  await connectDb();
  console.log('[startup] Database connection established');

  const server = app.listen(PORT, () => {
    console.log(`[startup] BFF server listening on port ${PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      try {
        await scanQueue.close();
        await pool.end();
        console.log('[shutdown] All connections closed. Goodbye.');
        process.exit(0);
      } catch (err) {
        console.error('[shutdown] Error during shutdown:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[shutdown] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[startup] Failed to start server:', err);
  process.exit(1);
});
