# ShadowAudit — Copilot Master Instructions

> **Read this file first on every task.** It tells you what the project is,
> how it is structured, which skill file applies to your task, and the non-
> negotiable rules that apply to every change.

---

## 1. Project Identity

**Name:** ShadowAudit  
**Purpose:** A DevSecOps vulnerability-monitoring platform. Users register Docker
images or npm packages; Trivy scans them; results are stored in PostgreSQL; a
notifier fires webhooks on new HIGH/CRITICAL CVEs; a React dashboard visualises
CVE status across all registered targets.

---

## 2. Architecture — 4 Microservices

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React/Vite SPA)                                       │
│  → HTTPS → Ingress                                              │
├─────────────┬───────────────────────────────────────────────────┤
│  frontend   │  packages/frontend  (React 18, Vite, TailwindCSS) │
│  bff        │  packages/bff       (Express, REST, auth, BullMQ) │
│  scanner    │  packages/scanner   (BullMQ worker, Trivy runner)  │
│  notifier   │  packages/notifier  (BullMQ worker, webhooks)     │
└─────────────┴───────────────────────────────────────────────────┘
         │              │              │
      PostgreSQL      Redis         GitHub / Slack webhooks
```

### Service responsibilities

| Service    | Responsibility |
|------------|----------------|
| **bff**    | REST API consumed by the frontend. Handles auth (JWT), registration of scan targets, enqueues scan jobs into `scan-jobs` BullMQ queue, exposes CVE results. |
| **scanner**| BullMQ worker that dequeues jobs and runs `trivy` subprocesses. Writes results back to PostgreSQL. Enqueues notification jobs into `notify-jobs`. |
| **notifier**| BullMQ worker that dequeues notification jobs, checks if any CVE is new and ≥ HIGH, then POSTs to registered webhook URLs. |
| **frontend**| React 18 SPA. Fetches from `/api` (proxied to bff). Shows CVE tables, severity badges, scan history. |

---

## 3. Monorepo Layout

```
project-3/
├── packages/
│   ├── bff/
│   │   ├── src/
│   │   │   ├── routes/          # Express routers
│   │   │   ├── middleware/      # auth, errorHandler, validate
│   │   │   ├── queues/          # BullMQ queue definitions
│   │   │   ├── db/              # pg pool, migration runner
│   │   │   └── index.ts         # server entry-point
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── scanner/
│   │   ├── src/
│   │   │   ├── workers/         # BullMQ workers
│   │   │   ├── trivy/           # trivy runner, output parser
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── ...
│   ├── notifier/
│   │   ├── src/
│   │   │   ├── workers/
│   │   │   ├── webhooks/        # HTTP POST logic
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── ...
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── main.tsx
│       ├── public/
│       └── ...
├── db/
│   └── migrations/              # SQL migration files, numbered 001_*.sql
├── k8s/
│   ├── namespace.yaml
│   ├── bff/                     # deployment, service, configmap, hpa
│   ├── scanner/
│   ├── notifier/
│   ├── frontend/
│   ├── postgres/
│   ├── redis/
│   └── ingress.yaml
├── .github/
│   ├── workflows/               # CI/CD YAML files
│   ├── skills/                  # Skill files (read for task context)
│   ├── agents/                  # Agent config files
│   └── copilot-instructions.md  # ← you are here
├── package.json                 # root workspace definition
└── tsconfig.base.json
```

---

## 4. Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 (strict mode, `"exactOptionalPropertyTypes": true`) |
| Backend framework | Express 4 |
| Job queue | BullMQ 5 + Redis 7 |
| Database | PostgreSQL 15 + `pg` library (no ORM) |
| Frontend | React 18, Vite 5, TailwindCSS 3 |
| Vulnerability scanning | Trivy (latest) |
| Containerisation | Docker (multi-stage builds) |
| Orchestration | Kubernetes 1.29 |
| CI/CD | GitHub Actions |
| Testing | Jest 29 + Supertest (backend), Vitest (frontend) |
| Schema validation | Zod 3 |
| Linting | ESLint 8 + Prettier |

---

## 5. Skill Files — Which One to Read

Before starting any task, open the appropriate skill file:

| Task type | Skill file |
|-----------|-----------|
| Adding/modifying TypeScript code, routes, BullMQ jobs, DB queries, tests | `.github/skills/software-development.md` |
| CVE found, updating deps, writing `.trivyignore` rules, interpreting scan output | `.github/skills/vulnerability-scanning.md` |
| K8s manifests, CI/CD workflows, Docker images, deployments, scaling | `.github/skills/devops-kubernetes.md` |

When a task spans multiple domains (e.g. a new scan feature that touches code **and** K8s), read all relevant skill files.

---

## 6. Coding Standards (apply to every change)

### TypeScript
- All files use `"strict": true`; never use `any` — use `unknown` and narrow.
- Every public function must have explicit return type annotations.
- Use `zod` to validate all external input (HTTP bodies, env vars, Trivy JSON).
- Prefer `const` over `let`; never use `var`.

### Express
- Each resource lives in its own router file under `src/routes/`.
- Async route handlers must be wrapped with `asyncHandler` from `express-async-errors`.
- Validation middleware runs **before** the handler.
- Never `res.send` a raw error object — always use the central error handler.

### BullMQ
- Queue names are defined as `const` in `packages/*/src/queues/names.ts`.
- Job data must be defined as a TypeScript interface and validated with Zod on the worker side.
- Workers set `concurrency: 4` by default; override per-service as needed.

### Database
- Use the shared `pg.Pool` from `packages/bff/src/db/pool.ts`.
- All queries use parameterised statements (`$1`, `$2`, …) — never string interpolation.
- Migrations live in `db/migrations/` and are run via the migration runner on startup.
- Never use an ORM.

### Error handling
- Every unhandled async error must be caught and forwarded to `next(err)`.
- The central error handler in `packages/bff/src/middleware/errorHandler.ts` is the single place that sets HTTP status codes and formats error responses.

### Environment variables
- Every service defines a `src/config.ts` that uses Zod to parse `process.env`.
- The service will throw at startup if a required env var is missing.
- Never read `process.env.SOMETHING` directly in application code — always import from `config.ts`.

### Naming conventions
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components.
- Database tables: `snake_case`.
- TypeScript interfaces/types: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE`.
- Never abbreviate unless the abbreviation is industry-standard (e.g. `cve`, `id`, `url`).

---

## 7. Testing Rules

1. **Always run tests after every code change** — no exceptions.
2. Write the test first (TDD), then the implementation.
3. Unit tests live in `packages/*/tests/unit/`.
4. Integration tests live in `packages/*/tests/integration/`.
5. Test file names mirror source file names with `.test.ts` suffix.
6. Minimum coverage target: 80 % lines per package.
7. Run: `npm test --workspace=packages/<name>` to test a single package.
8. Run: `npm test` from root to test all packages.

---

## 8. Security Rules — Non-Negotiable

- **Never commit secrets.** No API keys, passwords, tokens, or credentials in any file tracked by git.
- All secrets are injected at runtime via Kubernetes Secrets or GitHub Actions secrets.
- The `.trivyignore` file must contain a justification comment for every suppressed CVE.
- Any CRITICAL CVE (CVSS ≥ 9.0) with a known exploit must be escalated immediately — do not suppress.
- Dependencies must be pinned to exact versions in `package.json` (`"express": "4.18.3"`, not `"^4.18.3"`).

---

## 9. Git Commit Rules

- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Each commit must be atomic: one logical change per commit.
- Always include the trailer:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

---

## 10. Before Marking Any Task Done

- [ ] TypeScript compiles: `tsc --noEmit` passes with zero errors.
- [ ] All tests pass: `npm test` green.
- [ ] ESLint passes: `npm run lint` zero errors.
- [ ] No secrets in diff.
- [ ] If K8s manifests changed: `kubectl apply --dry-run=client -f k8s/` passes.
- [ ] If dependencies changed: re-run `npm ci` and commit `package-lock.json`.
