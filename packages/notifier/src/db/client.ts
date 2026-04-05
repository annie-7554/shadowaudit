import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  database: process.env.POSTGRES_DB ?? 'shadowaudit',
  user: process.env.POSTGRES_USER ?? 'shadowaudit',
  password: process.env.POSTGRES_PASSWORD ?? 'changeme',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});
