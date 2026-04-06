#!/usr/bin/env bash
# ShadowAudit - Local Development Startup
# Runs all services without Docker

set -e

export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

echo ""
echo "======================================"
echo "  ShadowAudit - Starting Local Stack"
echo "======================================"
echo ""

# 1. Check postgres
if ! pg_isready -q; then
  echo "[setup] Starting PostgreSQL..."
  brew services start postgresql@15
  sleep 2
fi
echo "[ok] PostgreSQL running"

# 2. Check redis
if ! redis-cli ping > /dev/null 2>&1; then
  echo "[setup] Starting Redis..."
  brew services start redis
  sleep 1
fi
echo "[ok] Redis running"

# 3. Kill any existing processes on our ports
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
echo "[ok] Ports cleared"

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 4. Start BFF
echo ""
echo "[start] BFF on http://localhost:3000"
cd "$ROOT/packages/bff"
npm run dev > "$ROOT/logs/bff.log" 2>&1 &
BFF_PID=$!

# 5. Start Scanner
echo "[start] Scanner (background worker)"
cd "$ROOT/packages/scanner"
npm run dev > "$ROOT/logs/scanner.log" 2>&1 &
SCANNER_PID=$!

# 6. Start Notifier
echo "[start] Notifier (background worker)"
cd "$ROOT/packages/notifier"
npm run dev > "$ROOT/logs/notifier.log" 2>&1 &
NOTIFIER_PID=$!

# 7. Wait for BFF to be ready
echo ""
echo "[wait] Waiting for BFF to start..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "[ok]  BFF is ready!"
    break
  fi
  sleep 1
done

# 8. Start Frontend
echo "[start] Frontend on http://localhost:5173"
cd "$ROOT/packages/frontend"
npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo ""
echo "======================================"
echo "  All services started!"
echo ""
echo "  Dashboard: http://localhost:5173"
echo "  API:       http://localhost:3000"
echo ""
echo "  Logs: ./logs/"
echo "======================================"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep running, kill all on exit
trap "echo 'Stopping...'; kill $BFF_PID $SCANNER_PID $NOTIFIER_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
