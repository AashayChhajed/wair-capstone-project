#!/usr/bin/env bash
# =============================================================================
# start-all.sh — one-command demo launcher
#
# Starts every service of the Job Market Analytics Platform together:
#   1. PostgreSQL (via docker compose, port 5433)
#   2. Backend API  (tsx watch, port 4000)
#   3. Frontend     (Vite dev server, port 5173)
#
# It also:
#   - installs dependencies if missing
#   - creates backend/.env and frontend/.env from .env.example if missing
#   - applies pending Prisma migrations (idempotent, never destructive)
#   - seeds demo data ONLY when the database is completely empty
#
# Usage:
#   bash scripts/start-all.sh        (anywhere, from the repo root)
#   npm run start:all                (npm alias)
#   bash scripts/start-all.sh --no-seed   (skip auto-seed of an empty DB)
#   bash scripts/start-all.sh --check     (verify environment, don't start servers)
#
# Windows: run from Git Bash, or double-click scripts/start-all.bat.
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AUTO_SEED=1
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-seed) AUTO_SEED=0 ;;
    --check)   CHECK_ONLY=1 ;;
    -h|--help)
      grep '^#' scripts/start-all.sh | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

info() { printf "\033[1;34m[start-all]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[start-all]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[start-all]\033[0m %s\n" "$*" >&2; exit 1; }

# --- 1. prerequisites --------------------------------------------------------
command -v node  >/dev/null 2>&1 || die "Node.js is not installed or not on PATH. See SETUP_GUIDE.md."
command -v npm   >/dev/null 2>&1 || die "npm is not installed or not on PATH. See SETUP_GUIDE.md."
command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH (required for PostgreSQL). See SETUP_GUIDE.md."

# --- 2. dependencies ---------------------------------------------------------
if [ ! -d node_modules ] || [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
  info "Dependencies missing — installing (this may take a while)..."
  npm install
  npm --prefix backend install
  npm --prefix frontend install
fi

# --- 3. environment files ----------------------------------------------------
if [ ! -f backend/.env ] || [ ! -f frontend/.env ]; then
  info "Missing .env file(s) — creating them from .env.example..."
  node scripts/copy-env.mjs
fi

# --- 4. database -------------------------------------------------------------
info "Starting PostgreSQL container (docker compose up -d)..."
docker compose up -d

info "Waiting for PostgreSQL to become healthy..."
db_healthy=""
for _ in $(seq 1 40); do
  # Compose v2 --format json: {"Health":"healthy"}; older compose: "(healthy)" in ps output.
  if docker compose ps --format json 2>/dev/null | grep -qi '"Health"[[:space:]]*:[[:space:]]*"healthy"'; then
    db_healthy=1
    break
  fi
  if docker compose ps 2>/dev/null | grep -q "(healthy)"; then
    db_healthy=1
    break
  fi
  sleep 1
done

if [ -z "$db_healthy" ]; then
  warn "Database did not report healthy within 40s. Check: docker compose ps"
  warn "Continuing anyway — the backend may fail to connect."
fi

# --- 5. migrations -----------------------------------------------------------
info "Applying database migrations (prisma migrate deploy)..."
npm --prefix backend run migrate:deploy

# --- 6. seed an empty database (optional, non-destructive) -------------------
if [ "$AUTO_SEED" = "1" ]; then
  user_count="$(
    cd backend && node -e "
      require('dotenv').config();
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.user.count()
        .then((c) => { console.log(c); process.exit(0); })
        .catch(() => { console.log('ERR'); process.exit(1); })
        .finally(() => p.\$disconnect());
    " 2>/dev/null || echo "ERR"
  )"
  if [ "$user_count" = "0" ]; then
    info "Database is empty — seeding demo data (jobs, users, clickstream)..."
    npm --prefix backend run seed
  else
    info "Database already has data ($user_count users) — skipping seed."
  fi
fi

# --- 7. run backend + frontend together --------------------------------------
if [ "$CHECK_ONLY" = "1" ]; then
  info "Environment check complete — everything looks ready."
  info "Next: bash scripts/start-all.sh   (or npm run dev)"
  exit 0
fi

info "Starting backend  → http://localhost:4000  (health: http://localhost:4000/health)"
info "Starting frontend → http://localhost:5173"
info "Press Ctrl+C to stop both servers."
exec npm run dev