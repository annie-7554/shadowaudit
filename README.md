# ShadowAudit

> **A full-stack DevSecOps platform for continuous CVE vulnerability scanning, triage, and auto-remediation of open-source dependencies and Docker images.**

---

## Table of Contents

1. [Introduction](#introduction)
2. [What Can It Do](#what-can-it-do)
3. [Architecture](#architecture)
4. [Supported Ecosystems](#supported-ecosystems)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
   - [macOS](#macos)
   - [Windows](#windows)
7. [Running Locally](#running-locally)
   - [Option A — One-Command Start (macOS)](#option-a--one-command-start-macos)
   - [Option B — Docker Compose](#option-b--docker-compose)
   - [Option C — Manual Service Start](#option-c--manual-service-start)
8. [CLI Usage](#cli-usage)
9. [Web Application](#web-application)
10. [Kubernetes Deployment](#kubernetes-deployment)
11. [Configuration](#configuration)
12. [Implementation](#implementation)
13. [Project Structure](#project-structure)

---

## Introduction

ShadowAudit is a **monorepo DevSecOps platform** built with TypeScript. It continuously scans your project's dependency files and Docker images against the [National Vulnerability Database (NVD)](https://nvd.nist.gov/) using [Aqua Trivy](https://github.com/aquasecurity/trivy) as its scanning engine.

The platform is designed around a real-world DevSecOps workflow:

1. **Discover** — register any npm package, Docker image, or dependency file as a scan target
2. **Scan** — Trivy runs asynchronously in the background, pulling CVE data from multiple advisory databases (NVD, OSV, GitHub Advisories, etc.)
3. **Triage** — view vulnerabilities in a web dashboard or CLI, with severity (CRITICAL / HIGH / MEDIUM / LOW), CVE IDs, CWE categories, and fix hints
4. **Remediate** — one CLI command reads your dependency file and bumps every vulnerable package to the lowest known-safe version, picking the highest stable semver when a package has multiple CVEs
5. **Notify** — a webhook notifier fires whenever a re-scan finds new vulnerabilities, enabling integration with Slack, PagerDuty, or any HTTP endpoint
6. **Deploy** — a full Kubernetes manifests directory is included for production deployment with Horizontal Pod Autoscaling on the scanner

ShadowAudit supports **7 language ecosystems** out of the box. You can upload any file with a supported extension — the platform auto-renames it to the canonical name Trivy requires, so `my-project-deps.txt` works just as well as `requirements.txt`.

---

## What Can It Do

### 🔍 Vulnerability Scanning
- Scan **npm packages** by name and version (`lodash@4.17.15`)
- Scan **Docker images** (`nginx:1.21`, `alpine:3.12`, any public image)
- Scan **dependency files** uploaded directly from your machine
- Scan results include: CVE ID, severity, package name, installed version, fixed version, and CWE category
- Scans run **asynchronously** — queue a scan and come back to results without blocking

### 📦 Multi-Ecosystem Dependency File Support
Upload a single file or file pair and get a full CVE report:

| Ecosystem | Files |
|-----------|-------|
| Node.js   | `package.json` |
| Python    | `requirements.txt` |
| Java      | `pom.xml` |
| Go        | `go.mod` + `go.sum` |
| Ruby      | `Gemfile.lock` |
| Rust      | `Cargo.lock` |
| PHP       | `composer.lock` |

> **Any filename works.** `my-deps.txt`, `app-requirements.txt`, `java-project.xml` — ShadowAudit detects the ecosystem from the file content and renames it internally.

### 🔧 Auto-Fix Vulnerabilities
The `fix` command reads your dependency file and rewrites vulnerable version pins to the safest available version:

```
shadowaudit fix my-app
```

- Groups all CVEs per package and picks the **single highest stable semver** across all advisories
- Supports: Node.js (`package.json`), Python (`requirements.txt`), Java (`pom.xml`), Go (`go.mod`)
- Auto-detects the dependency file from the scan directory — no `--pkg` flag needed
- Reduces CVE count from dozens (e.g. 47) down to **zero** in one command

### 🖥️ Web Dashboard
- Live dashboard with total targets, vulnerable count, critical CVE count, recent activity feed
- Target cards showing scan status at a glance (✔ Clean / ● Vulnerable / ○ Scanning)
- Upload dependency files directly from the browser — supports multi-file for Go
- CVE detail modal per target: full vulnerability table with severity badges, CWE IDs, fix version hints
- Add Docker images or npm packages directly from the UI

### ⌨️ CLI Tool
A full-featured command-line interface for scripting and CI/CD pipelines:

```
shadowaudit list                    # list all scan targets
shadowaudit scan lodash@4.17.15    # scan an npm package
shadowaudit scan nginx:1.21 -t docker -n my-nginx
shadowaudit status my-app           # view CVEs for a target
shadowaudit fix my-app              # auto-fix dependency versions
shadowaudit delete my-app           # remove a target
```

### 🔔 Webhook Notifier
- Polls for scan result changes after every scan
- Sends an HTTP POST to your configured `WEBHOOK_URL` when **new** vulnerabilities are found
- Payload includes: CVE IDs, severity, package names, fix versions, timestamp
- Retry logic: up to 3 attempts with backoff

### ☸️ Kubernetes-Ready
- Full manifests for all 5 services in `k8s/`
- Scanner has a **Horizontal Pod Autoscaler** — scales up under heavy scan load
- PostgreSQL and Redis run as StatefulSets with persistent volumes
- Nginx ingress routes `/api` to BFF and `/` to the frontend

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Browser / CLI                        │
└───────────┬──────────────────────────┬───────────────────┘
            │ HTTP REST                │ HTTP REST
            ▼                          ▼
  ┌──────────────────┐      ┌──────────────────────┐
  │   Frontend       │      │   BFF (Express API)  │
  │   (React/Vite)   │      │   :3000              │
  │   :5173          │      └──────────┬───────────┘
  └──────────────────┘                 │
                              ┌────────┴────────┐
                              │                 │
                         PostgreSQL          Redis
                         (targets,         (scan job
                          scans)            queue)
                              │                 │
                              └────────┬────────┘
                                       │ BullMQ worker
                                       ▼
                              ┌─────────────────┐
                              │    Scanner      │
                              │  (Trivy runner) │
                              └────────┬────────┘
                                       │ writes results
                                       ▼
                              ┌─────────────────┐
                              │    Notifier     │
                              │  (webhook diff) │
                              └─────────────────┘
```

**Data flow:**
1. BFF receives a scan request → writes target to PostgreSQL → pushes a job to Redis (BullMQ)
2. Scanner picks up the job → calls Trivy → parses CVEs → writes `scan_results` to PostgreSQL
3. Notifier queries scan history → diffs against previous scan → fires webhook if new CVEs appear
4. Frontend/CLI polls the BFF API for target status and scan results

---

## Supported Ecosystems

| Ecosystem | File | Auto-renamed from any `*.<ext>` |
|-----------|------|---------------------------------|
| Node.js   | `package.json` | any `*.json` (content-detected) |
| Python    | `requirements.txt` | any `*.txt` |
| Java/Maven | `pom.xml` | any `*.xml` |
| Go        | `go.mod` + `go.sum` | any `*.mod` + `*.sum` |
| Ruby      | `Gemfile.lock` | any `*.lock` starting with `GEM` |
| Rust      | `Cargo.lock` | any `*.lock` with `[[package]]` |
| PHP       | `composer.lock` | any `*.lock` with `"packages":` |

---

## Prerequisites

### All Platforms
- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://npmjs.com/) v9 or later
- [Trivy](https://aquasecurity.github.io/trivy/) — the CVE scanning engine
- PostgreSQL 15+
- Redis 7+

### macOS — Additional
- [Homebrew](https://brew.sh/)

### Windows — Additional
- [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) (Windows Subsystem for Linux) — **strongly recommended** for Trivy compatibility
- Or: [Docker Desktop](https://www.docker.com/products/docker-desktop/) for the Docker Compose path

---

## Installation

### macOS

```bash
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install dependencies
brew install node postgresql@15 redis trivy

# 3. Start PostgreSQL and Redis
brew services start postgresql@15
brew services start redis

# 4. Create the database
createdb shadowaudit
psql shadowaudit -c "CREATE USER shadowaudit WITH PASSWORD 'shadowaudit';"
psql shadowaudit -c "GRANT ALL PRIVILEGES ON DATABASE shadowaudit TO shadowaudit;"

# 5. Clone the repository
git clone https://github.com/annie-7554/shadowaudit.git
cd shadowaudit

# 6. Install all dependencies
npm install

# 7. Copy environment config
cp .env.example .env
# Edit .env if your PostgreSQL/Redis settings differ from the defaults

# 8. Run database migrations
cd packages/bff && npx ts-node src/db/migrate.ts && cd ../..

# 9. Build the CLI
cd packages/cli && npm run build && cd ../..
```

### Windows

#### Option A — WSL2 (Recommended)

```powershell
# 1. Open PowerShell as Administrator and install WSL2
wsl --install
# Restart your machine, then open Ubuntu from the Start menu

# Inside WSL2 Ubuntu terminal:
# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install PostgreSQL and Redis
sudo apt-get install -y postgresql postgresql-contrib redis-server

# 4. Install Trivy
sudo apt-get install -y wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main | \
  sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update && sudo apt-get install -y trivy

# 5. Start services
sudo service postgresql start
sudo service redis-server start

# 6. Create the database
sudo -u postgres psql -c "CREATE DATABASE shadowaudit;"
sudo -u postgres psql -c "CREATE USER shadowaudit WITH PASSWORD 'shadowaudit';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE shadowaudit TO shadowaudit;"

# 7. Clone and install
git clone https://github.com/annie-7554/shadowaudit.git
cd shadowaudit
npm install
cp .env.example .env

# 8. Migrate and build
cd packages/bff && npx ts-node src/db/migrate.ts && cd ../..
cd packages/cli && npm run build && cd ../..
```

#### Option B — Docker Compose (Windows, no WSL2 required)

```powershell
# Requires Docker Desktop to be installed and running

git clone https://github.com/annie-7554/shadowaudit.git
cd shadowaudit
npm install
copy .env.example .env

# Build and start everything
docker-compose up --build
```

The app will be available at `http://localhost:5173` with no further setup needed.

---

## Running Locally

### Option A — One-Command Start (macOS)

```bash
cd shadowaudit
bash start-local.sh
```

This script:
- Verifies PostgreSQL and Redis are running (starts them if not)
- Clears any stale processes on ports 3000 and 5173
- Starts BFF, Scanner, Notifier, and Frontend in the background
- Streams logs to `./logs/`
- Prints URLs when ready

Open `http://localhost:5173` in your browser.

### Option B — Docker Compose

> Requires Docker Desktop to be **installed and running** before proceeding. Open Docker Desktop and wait for the whale icon in the menu bar to show "Docker Desktop is running".

```bash
docker-compose up
```

Services included: `postgres`, `redis`, `bff`, `scanner`, `notifier`, `frontend`.

```bash
# Run in background
docker-compose up -d

# View logs for a specific service
docker-compose logs -f scanner

# Stop everything
docker-compose down
```

### Option C — Manual Service Start

Open four terminal windows:

**Terminal 1 — BFF**
```bash
cd shadowaudit/packages/bff
node -r ts-node/register src/index.ts
# Listening on http://localhost:3000
```

**Terminal 2 — Scanner**
```bash
cd shadowaudit/packages/scanner
node -r ts-node/register src/index.ts
# BullMQ worker started, waiting for jobs
```

**Terminal 3 — Notifier**
```bash
cd shadowaudit/packages/notifier
node -r ts-node/register src/index.ts
# Notifier polling for scan changes
```

**Terminal 4 — Frontend**
```bash
cd shadowaudit/packages/frontend
npm run dev
# Vite dev server on http://localhost:5173
```

---

## CLI Usage

The CLI talks to the BFF API. Make sure the BFF is running before using it.

```bash
# Build the CLI (only needed once, or after code changes)
cd packages/cli && npm run build && cd ../..

# Shorthand alias used in examples below
CLI="node packages/cli/dist/index.js"
```

### List all targets

```bash
$CLI list
# or
$CLI ls
```

```
  Name                    Type          Value                           Status
  ──────────────────────────────────────────────────────────────────────────────────────────
  my-node-app             filesystem    /tmp/shadowaudit-projects/17    ✔ Clean
  lodash-vulnerable       npm           lodash@4.17.15                  ● Vulnerable
  nginx-prod              docker        nginx:1.21                      ● Vulnerable
```

### Scan an npm package

```bash
$CLI scan lodash@4.17.15 -t npm -n lodash-check
$CLI scan minimist@0.2.0 -t npm
```

### Scan a Docker image

```bash
$CLI scan nginx:1.21 -t docker -n nginx-prod
$CLI scan alpine:3.12 -t docker
```

### Scan a local filesystem path

```bash
$CLI scan /path/to/your/project -t filesystem -n my-app
```

### Check scan status / view CVEs

```bash
$CLI status lodash-check
```

```
  Target: lodash-check  (npm: lodash@4.17.15)
  Status: ● Vulnerable
  Last scan: 4/6/2026, 12:00:00 AM

  Summary: 4 CRITICAL  12 HIGH  8 MEDIUM  2 LOW

  CVE ID              Severity    Package    Installed  Fixed      Title
  ─────────────────────────────────────────────────────────────────────────────────
  CVE-2021-23337      HIGH        lodash     4.17.15    4.17.21    Command Injection
  ...

  💡 14 vulnerabilities have a fix available.
     Run: shadowaudit fix lodash-check --pkg ./package.json to auto-fix.
```

### Auto-fix vulnerabilities

```bash
# Auto-detects the dependency file from the scan directory
$CLI fix my-app

# Or point to a specific file
$CLI fix my-app --pkg /path/to/package.json
$CLI fix my-python --pkg /path/to/requirements.txt
$CLI fix my-java   --pkg /path/to/pom.xml
$CLI fix my-go     --pkg /path/to/go.mod
```

**Before fix:**
```
47 CVEs across 8 packages
```

**After fix:**
```
✔ Fixed 8 packages in /tmp/shadowaudit-projects/123/package.json
```

Re-scan the target to confirm:
```bash
$CLI scan /tmp/shadowaudit-projects/123 -t filesystem -n my-app
$CLI status my-app
# → ✔ Clean
```

### Delete a target

```bash
$CLI delete my-app
# or
$CLI rm my-app
```

---

## Web Application

Open `http://localhost:5173` after starting the services.

### Dashboard

The dashboard (`/`) shows:
- **Total Targets** — number of registered scan targets
- **Vulnerable** — count of targets with active CVEs
- **Critical CVEs** — total CRITICAL-severity findings across all targets
- **Recent Activity** — latest scan events with timestamps

### Targets Page

The Targets page (`/targets`) is the main working view:

#### Adding a Target
1. Click **+ Add Target**
2. Enter a name, select type (`npm`, `docker`, or `filesystem`), and enter the package/image/path
3. Click **Add** — a scan job is immediately queued

#### Uploading a Dependency File
1. Click **Upload File** in the upload panel on the right
2. Select your dependency file (any filename with supported extension)
3. For Go: select **both** `go.mod` and `go.sum` together (multi-select)
4. Enter a target name and click **Upload**

Supported files: `package.json`, `requirements.txt`, `pom.xml`, `go.mod`+`go.sum`, `Gemfile.lock`, `Cargo.lock`, `composer.lock` — or any file with matching extension (e.g. `my-deps.txt`, `project-packages.json`)

#### Viewing CVEs
Click the **•** or **●** status indicator on any target card to open the CVE detail modal. The modal shows:
- Severity breakdown (CRITICAL / HIGH / MEDIUM / LOW counts)
- Full vulnerability table: CVE ID, severity badge, package name, installed version, fixed version, CWE category
- Auto-fix hint banner at the bottom with the exact CLI command to run

#### Target Status Indicators
| Icon | Meaning |
|------|---------|
| ✔ Clean | Scanned, no vulnerabilities found |
| ● Vulnerable | CVEs detected |
| ○ Scanning | Scan in progress |
| — Never scanned | Target registered, scan not yet started |

---

## Kubernetes Deployment

All manifests are in the `k8s/` directory.

```bash
# Create the namespace
kubectl apply -f k8s/namespace.yaml

# Apply secrets and config
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy infrastructure
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/

# Deploy application services
kubectl apply -f k8s/bff/
kubectl apply -f k8s/scanner/
kubectl apply -f k8s/notifier/
kubectl apply -f k8s/frontend/

# Apply ingress
kubectl apply -f k8s/ingress.yaml
```

### Horizontal Pod Autoscaler (Scanner)

The scanner has an HPA configured at `k8s/scanner/hpa.yaml`. It scales the scanner deployment based on CPU usage, automatically adding scanner pods when the scan queue fills up under heavy load.

```bash
kubectl get hpa -n shadowaudit
```

### Accessing the App

Once deployed with an ingress controller:
- `http://<your-domain>/` → Frontend
- `http://<your-domain>/api/` → BFF API

For local Kubernetes testing with `minikube`:
```bash
minikube tunnel
# Then access via the ingress IP
```

---

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```env
# PostgreSQL connection
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=shadowaudit
POSTGRES_USER=shadowaudit
POSTGRES_PASSWORD=shadowaudit

# Redis connection
REDIS_URL=redis://localhost:6379

# Webhook notifications (optional)
# Point this at a Slack incoming webhook, PagerDuty, or any HTTP endpoint
WEBHOOK_URL=http://localhost:9999/webhook

# App
NODE_ENV=development
PORT=3000
```

### Webhook Integration

Set `WEBHOOK_URL` to receive HTTP POST notifications when new CVEs are found. The payload looks like:

```json
{
  "event": "new_vulnerabilities",
  "target": "my-app",
  "timestamp": "2026-04-06T04:00:00.000Z",
  "count": 3,
  "vulnerabilities": [
    {
      "cveId": "CVE-2021-23337",
      "severity": "HIGH",
      "packageName": "lodash",
      "fixedVersion": "4.17.21",
      "title": "Command Injection in lodash"
    }
  ]
}
```

---

## Implementation

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode throughout) |
| Runtime | Node.js 20 |
| Frontend | React 18 + Vite + Tailwind CSS |
| API | Express.js |
| Database | PostgreSQL 15 (raw SQL, no ORM) |
| Queue | Redis + BullMQ |
| Scanner | Aqua Trivy |
| CLI | Commander.js + Chalk + Ora |
| Containers | Docker Compose + Kubernetes |
| Validation | Zod |

### Packages

```
packages/
├── bff/         Express REST API — manages targets, scan jobs, results
├── cli/         Commander.js CLI — list, scan, status, fix, delete
├── frontend/    React + Vite dashboard and targets UI
├── scanner/     BullMQ worker — calls Trivy, parses results, saves to DB
└── notifier/    Polls scan results, diffs against previous run, sends webhooks
```

### How Scanning Works

1. **BFF** receives a `POST /api/targets` or `POST /api/targets/upload`
2. Target is saved to PostgreSQL with `status = 'never_scanned'`
3. A BullMQ job `{ type, value, targetId }` is pushed to Redis
4. **Scanner worker** picks up the job:
   - For `npm`: runs `trivy fs --package-manager npm` on a synthetic lock file
   - For `docker`: runs `trivy image --format json <image>`
   - For `filesystem`: runs `trivy fs --format json <path>`
   - If `package.json` is present without a lock file, runs `npm install --package-lock-only` first
5. Trivy output is parsed into `ParsedVulnerability[]` objects
6. Results (CVE ID, severity, package, installed/fixed versions, CWE) are written to `scan_results` table
7. Target `status` is updated to `'vulnerable'` or `'clean'`
8. **Notifier** detects the new result, diffs against the previous scan, fires webhook if new CVEs appeared

### How Auto-Fix Works

The `fix` command in the CLI:

1. Fetches the latest scan results from the BFF API
2. Filters vulnerabilities that have a `fixedVersion`
3. Groups CVEs by package name — a single package may appear in many CVEs
4. For each package, parses all `fixedVersion` values (Trivy returns comma-separated lists like `"1.8.2, 0.30.0"`)
5. Uses a semver comparator to select the **single highest stable (non-prerelease) version** across all CVEs for that package
6. Rewrites the dependency file once per package — never overwrites the same package twice (which was a prior bug causing wrong final versions)

**Example fix resolution:**
```
CVE-2021-3749  →  axios  →  fixedVersion: "0.21.2, 0.26.1, 1.13.5"
CVE-2023-45857 →  axios  →  fixedVersion: "1.6.0"

→ picks max stable: 1.13.5
→ writes: "axios": "^1.13.5" in package.json
```

### File Upload & Canonical Naming

Trivy identifies ecosystems strictly by filename. ShadowAudit solves this with a `canonicalName()` function in the BFF:

- Unambiguous extensions (`.txt`, `.xml`, `.sum`, `.mod`, `.toml`) are mapped directly
- `.json` files are read and checked for `"packages"` + `"require"` keys to distinguish `composer.json` from `package.json`
- `.lock` files are read and the first line / key patterns identify Gemfile.lock vs Cargo.lock vs package-lock.json vs composer.lock

This means any file your users upload — regardless of the name — is saved with the correct canonical name before Trivy sees it.

---

## Project Structure

```
shadowaudit/
├── packages/
│   ├── bff/
│   │   └── src/
│   │       ├── index.ts           Express app entry point
│   │       ├── routes/
│   │       │   ├── targets.ts     Target CRUD + file upload
│   │       │   └── dashboard.ts   Stats aggregation
│   │       ├── db/
│   │       │   ├── targets.ts     PostgreSQL queries
│   │       │   └── migrate.ts     Schema migrations
│   │       ├── queue/
│   │       │   └── producer.ts    BullMQ job producer
│   │       └── middleware/
│   │           ├── validate.ts    Zod request validation
│   │           └── errorHandler.ts
│   ├── cli/
│   │   └── src/
│   │       ├── index.ts           CLI entry point
│   │       ├── program.ts         All commands (list/scan/status/fix/delete)
│   │       ├── fix.ts             Multi-ecosystem auto-fix logic
│   │       ├── api.ts             BFF HTTP client
│   │       └── display.ts         Table + status formatting
│   ├── frontend/
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Dashboard.tsx  Stats overview
│   │       │   └── Targets.tsx    Target management + CVE modal
│   │       └── api/
│   │           └── targets.ts     Frontend API client
│   ├── scanner/
│   │   └── src/
│   │       ├── index.ts           BullMQ worker entry
│   │       ├── worker.ts          Job processor
│   │       └── trivy/
│   │           ├── runner.ts      Trivy execution (npm/docker/filesystem)
│   │           └── parser.ts      Trivy JSON output parser
│   └── notifier/
│       └── src/
│           ├── index.ts           Notifier entry
│           ├── listener.ts        Scan result change detector
│           ├── diff.ts            CVE diff logic
│           └── webhook.ts         HTTP webhook sender (3 retries)
├── k8s/                           Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── ingress.yaml
│   ├── bff/                       Deployment + Service
│   ├── scanner/                   Deployment + HPA
│   ├── notifier/                  Deployment
│   ├── frontend/                  Deployment + Service
│   ├── postgres/                  StatefulSet + Service
│   └── redis/                     StatefulSet + Service
├── db/                            Raw SQL schema files
├── logs/                          Runtime log files (gitignored)
├── docker-compose.yml
├── start-local.sh                 One-command local startup (macOS)
├── .env.example
├── tsconfig.base.json
└── package.json                   Root workspace
```

---

## License

MIT
