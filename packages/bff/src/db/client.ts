import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'shadowaudit',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export async function connectDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[db] Connected to PostgreSQL');
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  console.debug(`[db] query executed in ${duration}ms rows=${result.rowCount}`);
  return result;
}

export { pool };
