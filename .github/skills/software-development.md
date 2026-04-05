# Skill: Software Development — ShadowAudit

> Read this file for any task that involves TypeScript source code, Express routes,
> BullMQ jobs, PostgreSQL queries, React components, or Jest tests.

---

## 1. TypeScript Strict Mode Patterns

The root `tsconfig.base.json` enables the strictest possible TypeScript settings.
Every `packages/*/tsconfig.json` extends it.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### Handling `unknown` instead of `any`

```typescript
// ✅ correct — narrow the unknown before use
function processWebhookBody(body: unknown): WebhookPayload {
  const result = WebhookPayloadSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.message);
  }
  return result.data;
}

// ❌ wrong — never do this
function processWebhookBody(body: any): WebhookPayload { ... }
```

### Branded types for IDs

```typescript
// packages/bff/src/types/ids.ts
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type ScanTargetId = Brand<string, 'ScanTargetId'>;
export type CveId = Brand<string, 'CveId'>;

// Use:
const id = row.id as ScanTargetId;
```

### Discriminated unions for results

```typescript
type ScanResult =
  | { status: 'ok';    findings: Finding[] }
  | { status: 'error'; message: string     };

function handleResult(result: ScanResult) {
  if (result.status === 'error') {
    logger.error(result.message); // TypeScript knows message exists
    return;
  }
  // TypeScript knows findings exists here
  processFindings(result.findings);
}
```

---

## 2. Environment Variable Validation (Zod)

Every service has a `src/config.ts` that validates env vars at startup:

```typescript
// packages/bff/src/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT:          z.coerce.number().int().positive().default(3000),
  DATABASE_URL:  z.string().url(),
  REDIS_URL:     z.string().url(),
  JWT_SECRET:    z.string().min(32),
  NODE_ENV:      z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL:     z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Throws at startup with a descriptive message if any required var is missing
export const config = ConfigSchema.parse(process.env);
export type Config = z.infer<typeof ConfigSchema>;
```

Import `config` everywhere — never read `process.env` directly in application code.

---

## 3. Express Route Structure

### Router file pattern

```typescript
// packages/bff/src/routes/scans.ts
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { ScanService } from '../services/ScanService.js';

const router = Router();

// ── Schemas ─────────────────────────────────────────────────────────────────
const CreateScanBodySchema = z.object({
  targetType: z.enum(['image', 'fs', 'config', 'secret']),
  targetRef:  z.string().min(1).max(512),
});

// ── Handlers ─────────────────────────────────────────────────────────────────
router.post(
  '/',
  validate(CreateScanBodySchema),              // validation middleware runs first
  asyncHandler(async (req: Request, res: Response) => {
    const body = CreateScanBodySchema.parse(req.body);
    const scan = await ScanService.create(body);
    res.status(201).json(scan);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const scan = await ScanService.findById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }
    res.json(scan);
  }),
);

export default router;
```

### Validation middleware

```typescript
// packages/bff/src/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error:   'Validation failed',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;  // replace with parsed/coerced data
    next();
  };
}
```

### Central error handler

```typescript
// packages/bff/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error:   err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
```

### asyncHandler helper

```typescript
// packages/bff/src/middleware/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncFn): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### Registering routers in index.ts

```typescript
// packages/bff/src/index.ts
import 'express-async-errors';
import express from 'express';
import { config } from './config.js';
import scansRouter from './routes/scans.js';
import targetsRouter from './routes/targets.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
app.use(express.json());

// Health endpoints (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready',  (_req, res) => res.json({ status: 'ready' }));

// Authenticated routes
app.use('/api/scans',   scansRouter);
app.use('/api/targets', targetsRouter);

// Central error handler — must be last
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`bff listening on port ${config.PORT}`);
});
```

---

## 4. BullMQ Job Definitions

### Queue names constant

```typescript
// packages/bff/src/queues/names.ts  (also imported by scanner and notifier)
export const QUEUE_SCAN_JOBS   = 'scan-jobs'   as const;
export const QUEUE_NOTIFY_JOBS = 'notify-jobs' as const;
```

### Typed job data interfaces

```typescript
// packages/bff/src/queues/types.ts
export interface ScanJobData {
  scanId:     string;   // UUID of the scan record in PostgreSQL
  targetType: 'image' | 'fs' | 'config' | 'secret';
  targetRef:  string;   // image tag or filesystem path
  severity:   ('CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN')[];
}

export interface NotifyJobData {
  scanId:      string;
  targetRef:   string;
  newCveIds:   string[];   // CVE IDs discovered since last scan
  webhookUrls: string[];
}
```

### Adding a job (from bff)

```typescript
// packages/bff/src/queues/scanQueue.ts
import { Queue } from 'bullmq';
import { config } from '../config.js';
import { QUEUE_SCAN_JOBS } from './names.js';
import type { ScanJobData } from './types.js';

export const scanQueue = new Queue<ScanJobData>(QUEUE_SCAN_JOBS, {
  connection: { url: config.REDIS_URL },
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail:     { count: 500 },
  },
});

export async function enqueueScan(data: ScanJobData): Promise<void> {
  await scanQueue.add('run-scan', data, {
    jobId: data.scanId,   // idempotent: same scanId won't be enqueued twice
  });
}
```

### Worker pattern (scanner service)

```typescript
// packages/scanner/src/workers/scanWorker.ts
import { Worker, Job } from 'bullmq';
import { config } from '../config.js';
import { QUEUE_SCAN_JOBS } from '../queues/names.js';
import type { ScanJobData } from '../queues/types.js';
import { runTrivy } from '../trivy/runner.js';
import { saveScanResults } from '../db/results.js';

const worker = new Worker<ScanJobData>(
  QUEUE_SCAN_JOBS,
  async (job: Job<ScanJobData>) => {
    const { scanId, targetType, targetRef, severity } = job.data;

    await job.updateProgress(10);
    const trivyOutput = await runTrivy({ targetType, targetRef, severity });

    await job.updateProgress(80);
    await saveScanResults(scanId, trivyOutput);

    await job.updateProgress(100);
  },
  {
    connection:  { url: config.REDIS_URL },
    concurrency: 4,
  },
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

export default worker;
```

---

## 5. PostgreSQL — Connection Pooling & Queries

### Pool setup

```typescript
// packages/bff/src/db/pool.ts
import { Pool } from 'pg';
import { config } from '../config.js';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max:              10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Validate connection at startup
pool.query('SELECT 1').catch((err) => {
  console.error('PostgreSQL connection failed:', err.message);
  process.exit(1);
});
```

### Parameterised queries (always use `$n` placeholders)

```typescript
// packages/bff/src/db/scans.ts
import { pool } from './pool.js';
import type { ScanRecord } from '../types/scan.js';

export async function insertScan(
  targetId: string,
  targetType: string,
): Promise<ScanRecord> {
  const { rows } = await pool.query<ScanRecord>(
    `INSERT INTO scans (target_id, target_type, status, created_at)
     VALUES ($1, $2, 'pending', NOW())
     RETURNING *`,
    [targetId, targetType],   // ← parameterised, never string-interpolate
  );
  // noUncheckedIndexedAccess requires the check
  const row = rows[0];
  if (!row) throw new Error('Insert returned no rows');
  return row;
}

export async function findScanById(id: string): Promise<ScanRecord | null> {
  const { rows } = await pool.query<ScanRecord>(
    'SELECT * FROM scans WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}
```

### Migration pattern

```typescript
// packages/bff/src/db/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './pool.js';

export async function runMigrations(migrationsDir: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file],
    );
    if (rowCount && rowCount > 0) continue;   // already applied

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      await pool.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}
```

---

## 6. Jest Unit & Integration Testing

### Jest config (`jest.config.ts`)

```typescript
// packages/bff/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset:              'ts-jest/presets/default-esm',
  testEnvironment:     'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper:    { '^(\\.{1,2}/.*)\\.js$': '$1' },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold:   { global: { lines: 80 } },
  setupFilesAfterFramework: ['<rootDir>/tests/setup.ts'],
};
export default config;
```

### Route test with Supertest

```typescript
// packages/bff/tests/unit/routes/scans.test.ts
import request from 'supertest';
import app from '../../../src/app.js';           // export app without listen()
import { pool } from '../../../src/db/pool.js';

afterAll(() => pool.end());

describe('POST /api/scans', () => {
  it('returns 201 and scan object on valid body', async () => {
    const res = await request(app)
      .post('/api/scans')
      .send({ targetType: 'image', targetRef: 'nginx:latest' })
      .expect(201);

    expect(res.body).toMatchObject({
      id:         expect.any(String),
      targetType: 'image',
      status:     'pending',
    });
  });

  it('returns 400 when targetType is invalid', async () => {
    await request(app)
      .post('/api/scans')
      .send({ targetType: 'invalid', targetRef: 'nginx:latest' })
      .expect(400);
  });
});
```

### Mocking the DB pool in unit tests

```typescript
// packages/bff/tests/unit/db/scans.test.ts
import { jest } from '@jest/globals';
import { pool } from '../../../src/db/pool.js';

jest.spyOn(pool, 'query').mockResolvedValueOnce({
  rows:     [{ id: 'abc', status: 'pending' }],
  rowCount: 1,
} as never);
```

---

## 7. Monorepo Import Patterns

The root `package.json` defines workspaces:

```json
{
  "workspaces": ["packages/*"]
}
```

Each package's `package.json` declares its name:

```json
{ "name": "@shadowaudit/bff" }
```

To share types between packages, import via workspace reference — never use relative
`../../` paths that cross package boundaries:

```typescript
// In packages/scanner/src/queues/types.ts — DO NOT import from ../../../bff
// Instead, publish shared types to packages/shared and reference:
import type { ScanJobData } from '@shadowaudit/shared';
```

In `packages/scanner/package.json`:

```json
{
  "dependencies": {
    "@shadowaudit/shared": "*"
  }
}
```

---

## 8. File Structure Rules

```
packages/<service>/
├── src/
│   ├── index.ts           # entry point; calls app.listen() or worker.run()
│   ├── app.ts             # Express app factory (export without listen — for tests)
│   ├── config.ts          # Zod env var validation
│   ├── routes/            # one file per resource: scans.ts, targets.ts, ...
│   ├── middleware/        # asyncHandler.ts, validate.ts, errorHandler.ts, auth.ts
│   ├── services/          # business logic: ScanService.ts, TargetService.ts
│   ├── db/                # pool.ts, migrate.ts, one query file per table
│   ├── queues/            # names.ts, types.ts, scanQueue.ts, notifyQueue.ts
│   └── types/             # domain interfaces: Scan.ts, Target.ts, Finding.ts
├── tests/
│   ├── unit/              # mirrors src/ structure
│   └── integration/       # full HTTP tests against test DB
├── Dockerfile
├── jest.config.ts
├── package.json
└── tsconfig.json
```

---

## 9. Naming Conventions Summary

| Entity | Convention | Example |
|--------|-----------|---------|
| File (module) | camelCase | `scanQueue.ts` |
| File (React) | PascalCase | `CveTable.tsx` |
| Interface | PascalCase | `ScanJobData` |
| Type alias | PascalCase | `ScanStatus` |
| Enum | PascalCase + UPPER values | `Severity.CRITICAL` |
| Constant | SCREAMING_SNAKE_CASE | `QUEUE_SCAN_JOBS` |
| DB table | snake_case | `scan_results` |
| DB column | snake_case | `created_at` |
| HTTP route | kebab-case | `/api/scan-targets` |
| Env var | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
