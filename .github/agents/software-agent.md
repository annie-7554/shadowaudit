# Agent: Software Development — ShadowAudit

> **Use this agent for:** adding features, fixing bugs, writing tests, and
> refactoring TypeScript code in any of the four ShadowAudit microservices.

---

## 1. When to Activate This Agent

Activate the software-agent when the task involves:

- Adding a new API endpoint to `packages/bff`
- Adding or modifying a BullMQ worker in `packages/scanner` or `packages/notifier`
- Writing or updating a React component in `packages/frontend`
- Fixing a bug in any TypeScript source file
- Refactoring code for clarity, performance, or maintainability
- Adding, updating, or fixing unit/integration tests
- Updating shared types or utility functions

**Do NOT use this agent for:**
- CVE fixes or `.trivyignore` updates → use `security-agent`
- Kubernetes manifest changes → use `devops-agent`
- GitHub Actions workflow modifications → use `devops-agent`
- Dockerfile updates → use `devops-agent`

---

## 2. Mandatory Pre-Task Reading

Before writing any code, read:

```
.github/skills/software-development.md
```

This file contains the authoritative patterns for TypeScript, Express, BullMQ,
PostgreSQL, Jest, and monorepo conventions used in ShadowAudit. Do not invent
patterns that contradict what is documented there.

---

## 3. Files Allowed to Modify

```
packages/*/src/**
packages/*/tests/**
packages/*/package.json       (dependency changes only — never change "name" or "scripts")
packages/*/tsconfig.json      (extends changes only)
db/migrations/*.sql           (add new migration files — never modify existing ones)
.trivyignore                  (only if updating a dev dependency that resolves a CVE)
```

## 4. Files NOT to Touch

```
k8s/**                        → devops-agent only
.github/workflows/**          → devops-agent only
packages/*/Dockerfile         → devops-agent only
package-lock.json             → updated automatically by npm; never hand-edit
```

If a task requires changes in both code AND infrastructure files, complete the
code changes first, then hand off to `devops-agent` with a clear description of
what infrastructure changes are needed.

---

## 5. Development Workflow

### Step 1: Understand the task
- Read the issue/PR description carefully.
- Identify which service(s) are affected: `bff`, `scanner`, `notifier`, `frontend`.
- Read the relevant section of `software-development.md` for the patterns you'll use.

### Step 2: Write the test first (TDD)
Every feature or bug fix must have a test written **before** the implementation:

```bash
# Create the test file first
# packages/bff/tests/unit/routes/webhooks.test.ts

# Run it — it should fail (red)
npm test --workspace=packages/bff -- --testPathPattern=webhooks
```

### Step 3: Implement
- Follow the patterns in `software-development.md` exactly.
- Export the app without calling `listen()` so tests can import it.
- Use `asyncHandler` for all async route handlers.
- Validate all external input with Zod.

### Step 4: Verify
Run all three checks — **all must pass** before the task is done:

```bash
# 1. Type-check (zero errors required)
npx tsc --noEmit -p packages/<service>/tsconfig.json

# 2. Tests (all green, ≥ 80% coverage)
npm test --workspace=packages/<service> -- --coverage

# 3. Lint (zero errors required)
npm run lint --workspace=packages/<service>
```

Or run everything from root:
```bash
npm run typecheck && npm test && npm run lint
```

---

## 6. Common Task Patterns

### Adding a new REST endpoint

1. Create route file: `packages/bff/src/routes/<resource>.ts`
2. Define Zod schema for request body.
3. Implement handler using `asyncHandler`.
4. Register router in `packages/bff/src/app.ts`.
5. Write Supertest tests in `packages/bff/tests/unit/routes/<resource>.test.ts`.

### Adding a new BullMQ job type

1. Add job data interface to `packages/shared/src/queues/types.ts`.
2. Add queue name constant to `packages/shared/src/queues/names.ts`.
3. Create queue in the enqueuing service (usually `bff`).
4. Create worker in the processing service (usually `scanner` or `notifier`).
5. Write unit tests for the worker logic (mock the external calls).

### Adding a new database table

1. Create migration: `db/migrations/<NNN>_add_<table_name>.sql`
   - Use sequential numbering (e.g. `003_add_webhooks.sql`).
   - Never modify existing migration files.
2. Define TypeScript interface for the row type.
3. Create query functions in `packages/bff/src/db/<table>.ts`.
4. Write unit tests with mocked `pool.query`.

### Fixing a bug

1. Write a failing test that reproduces the bug.
2. Fix the code until the test passes.
3. Check if the bug exists in other services too (same code pattern).
4. Run full test suite to ensure no regressions.

---

## 7. Validation Checklist

Before marking any software task as done:

- [ ] `tsc --noEmit` passes with **zero** errors across affected packages
- [ ] `npm test` — all tests green, no skipped tests without justification
- [ ] Coverage report shows ≥ 80% lines for modified files
- [ ] `npm run lint` — zero ESLint errors (warnings are acceptable but should be minimised)
- [ ] No `console.log` debug statements left in source (use the logger)
- [ ] No hardcoded values that should be config/env vars
- [ ] No `any` types introduced
- [ ] All new functions have explicit return type annotations
- [ ] Import paths use `.js` extension (required for NodeNext module resolution)
- [ ] New environment variables are added to `src/config.ts` Zod schema
- [ ] `package-lock.json` committed if dependencies were changed

---

## 8. Project Structure Quick Reference

```
packages/bff/src/
├── app.ts            # Express app (no listen — exported for tests)
├── index.ts          # Calls app.listen()
├── config.ts         # Zod env validation
├── routes/           # Router files
├── middleware/        # asyncHandler, validate, errorHandler, auth
├── services/         # Business logic
├── db/               # Pool, migrations, query files
├── queues/           # Queue definitions
└── types/            # Domain interfaces

packages/scanner/src/
├── index.ts          # Starts BullMQ worker
├── config.ts
├── workers/          # Worker definitions
└── trivy/            # Trivy runner + JSON parser

packages/notifier/src/
├── index.ts
├── config.ts
├── workers/
└── webhooks/         # HTTP POST to external webhook URLs

packages/frontend/src/
├── main.tsx          # Vite entry
├── App.tsx
├── components/       # Reusable components
├── pages/            # Route-level components
└── hooks/            # Custom React hooks
```

---

## 9. Logging

Use the shared logger, not `console.log`:

```typescript
// packages/shared/src/logger.ts
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// In application code:
import { logger } from '@shadowaudit/shared';
logger.info({ scanId: '...' }, 'Scan started');
logger.error({ err }, 'Scan failed');
```

---

## 10. Error Classes

Use typed error classes for operational errors:

```typescript
// packages/shared/src/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}
```
