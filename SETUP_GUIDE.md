# SETUP GUIDE — JobScope (Job Search, Recommendation & Recruitment Analytics Platform)

This guide walks you through running the entire project **locally** — database, backend API and
frontend — with no manual configuration and minimal terminal juggling.

---

## 1. Prerequisites

| Requirement | Version / Notes |
|-------------|-----------------|
| **Node.js** | v18.18+ (v20 or v22 LTS recommended). Check: `node -v` |
| **npm** | ships with Node. Check: `npm -v` |
| **Docker Desktop** | required for PostgreSQL. Must be **running** before starting the app |
| **Git Bash** (Windows only) | needed for the shell scripts. Install from https://git-scm.com |
| **Git** | to clone the repository (optional if you already have the files) |

> 💡 **Windows users:** use **Git Bash** (not cmd/PowerShell) for the commands below, or use the
> provided `scripts/start-all.bat`. PowerShell/cmd also work for plain `npm run …` commands.

> **Important:** run commands from the project root (`E:\wair-capstone`), the folder containing
> `package.json` and this guide. Do not run `npm run setup` from the `scripts` folder.

## 2. What Runs Where

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite / React) | 5173 | http://localhost:5173 |
| Backend (Express API) | 4000 | http://localhost:4000/api |
| PostgreSQL (Docker) | 5433 (host) → 5432 (container) | `postgresql://postgres:postgres@localhost:5433/job_platform` |

## 3. Quick Start (recommended)

Open a terminal **in the project root** and run:

```bash
npm run setup
```

This single command:
1. installs root + backend + frontend dependencies,
2. creates `backend/.env` and `frontend/.env` from `.env.example` (skipped if they already exist),
3. starts the PostgreSQL container (`docker compose up -d`),
4. runs the database migrations,
5. seeds the database with realistic demo data (users, jobs, applications, 30-day clickstream).

Then start **everything together** with one command:

```bash
# Option A — all-in-one launcher (starts DB too, seeds an empty DB automatically):
bash scripts/start-all.sh

# Option B — just the two servers (DB must already be up from `npm run setup`):
npm run dev
```

On Windows, the simplest option is to run this from PowerShell or Command Prompt:

```powershell
npm run start:all:windows
```

Open **http://localhost:5173** and log in with a demo account (section 5).

## Stop everything

When finished, press **Ctrl+C** in the terminal running the application. Then, from the project
root, stop PostgreSQL:

```powershell
npm run db:down
```

If Windows leaves the backend or frontend running after **Ctrl+C**, clean up the project ports with
PowerShell and then stop the database:

```powershell
Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue |
	Select-Object -ExpandProperty OwningProcess -Unique |
	Stop-Process -Force -ErrorAction SilentlyContinue
npm run db:down
```

Verify shutdown if needed:

```powershell
Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue
docker compose ps
```

The first command should return no listeners and `docker compose ps` should show no running
services. Database data is preserved by `npm run db:down`. Only use `docker compose down -v` when
you intentionally want to delete the database volume and start from an empty database.

## 4. Manual Setup (step by step, if you prefer)

### 4.1 Install dependencies

```bash
npm install                 # root (concurrently etc.)
npm --prefix backend install
npm --prefix frontend install
```

### 4.2 Create environment files

```bash
node scripts/copy-env.mjs   # creates backend/.env and frontend/.env from .env.example
```

The defaults in `.env.example` already match the docker-compose setup, so you normally don't need
to edit anything. If you change `JWT_SECRET`, `PORT` or `DATABASE_URL`, do it **before** starting.

### 4.3 Start PostgreSQL

```bash
docker compose up -d        # PostgreSQL 16 on host port 5433
docker compose ps           # wait for STATUS to show "(healthy)"
```

### 4.4 Run migrations & seed

```bash
npm --prefix backend run migrate:deploy   # apply migrations (idempotent)
npm --prefix backend run seed             # demo data (only needed once)
```

### 4.5 Start the application

```bash
npm run dev                 # starts backend (:4000) and frontend (:5173) together
# or, in separate terminals:
npm run dev:backend
npm run dev:frontend
```

## 5. Demo Accounts

All demo accounts share the password **`Password123!`** (also visible on the login page):

| Role | Email | Best place to explore |
|------|-------|------------------------|
| **Job Seeker** | `demo.seeker@example.com` | Job search, recommendations, applications, saved jobs, profile |
| **Recruiter** | `demo.recruiter@example.com` | Job posting, applicant tracker, per-job analytics |
| **Admin** | `demo.admin@example.com` | KPI dashboard, Search Evaluation, A/B Test, Search Intelligence |

Admin demo routes: `/admin` (dashboard), `/admin/search-evaluation` (IR metrics),
`/admin/abtest` (A/B experiment), `/intelligence` (Search Intelligence — also public).

## 6. Useful Commands

| Task | Command |
|------|---------|
| Install everything + setup + seed | `npm run setup` |
| Start all services (DB + backend + frontend) | `bash scripts/start-all.sh` |
| Start all services on Windows | `npm run start:all:windows` |
| Start backend + frontend only | `npm run dev` |
| Start backend only | `npm run dev:backend` |
| Start frontend only | `npm run dev:frontend` |
| Re-seed demo data | `npm run seed` |
| Run backend tests | `npm test` (root) or `npm --prefix backend test` |
| Typecheck everything | `npm run typecheck` |
| Production build | `npm run build` |
| Stop PostgreSQL after stopping the app | `npm run db:down` |
| Stop Docker Desktop completely | `docker desktop stop` |

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `docker: command not found` / container won't start | Install & start **Docker Desktop**, then re-run `docker compose up -d`. |
| `Connection refused` on port 5433 | Postgres container isn't up yet — run `docker compose up -d` and wait for `(healthy)` in `docker compose ps`. |
| `EADDRINUSE` on port 4000 or 5173 | Another instance is already running. Stop it, or change `PORT` in `backend/.env` / `server.port` in `frontend/vite.config.ts`. |
| `bash: scripts/start-all.sh: No such file or directory` | Run the script from the **project root** (`bash scripts/start-all.sh`), or use `npm run start:all`. |
| `bash.exe not found` (Windows) | Install Git for Windows, or fall back to: `npm run setup` then `npm run dev`. |
| `Ctrl+C` does not stop the app on Windows | Run the PowerShell cleanup command in section 4.6, then run `npm run db:down`. |
| Backend logs `P1001` / can't reach database | Check `DATABASE_URL` in `backend/.env` matches `postgresql://postgres:postgres@localhost:5433/job_platform`. |
| Login fails with "Invalid email or password" | Use the demo accounts above with password `Password123!`, or register a new account. |
| Empty dashboards | Run `npm run seed` once — all analytics are computed from stored events, so empty DB = empty charts. |
| `tsx` / `prisma` command not found | Dependencies weren't installed: run the install step in section 4.1 (or `npm run setup`). |
| Prisma client type errors after schema change | `npm --prefix backend run generate` then restart the backend. |
| CORS errors in the browser console | `CORS_ORIGIN` in `backend/.env` must include `http://localhost:5173` (it does by default). |

## 8. Resetting the Database

To wipe and re-seed from scratch (safe — everything is generated demo data):

```bash
docker compose down -v     # stop Postgres AND delete its volume
npm run setup              # recreates DB, migrates, seeds
```

Or, keeping the container but resetting data:

```bash
npm --prefix backend run migrate:deploy
npm run seed               # seed wipes existing data and regenerates it
```

> ⚠️ `npm run seed` **replaces** all data with fresh demo data — don't run it if you have real
> data you want to keep.