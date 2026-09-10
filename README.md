# JobScope — Job Search, Recommendation & Recruitment Analytics Platform

A full-stack **Web Analytics & Information Retrieval** capstone project: an intelligent job-search
platform with a from-scratch IR engine (TF-IDF + BM25), content-based recommendations, clickstream
analytics, A/B testing, and standard IR evaluation — all computed live from real data, nothing
hard-coded.

> Built as the academic capstone for a **Web Analytics and Information Retrieval** course. The IR
> engine, evaluation dataset, and analytics pipeline are deliberately transparent and explainable
> so every result can be justified in a viva.

---

## ✨ Features

### Core Recruitment Platform
- **Authentication** — register / login / logout, JWT sessions, bcrypt password hashing, role-based
  access control (`JOB_SEEKER`, `RECRUITER`, `ADMIN`), rate-limited auth endpoints, `/auth/me`.
- **Profiles** — job-seeker profile with skills, location, experience, preferred role/location,
  bio; normalized skill tags with autocomplete.
- **Companies & Jobs** — recruiters register a company and post jobs (title, description, skills,
  location, experience, salary, employment type, deadline); full listing, filtering and detail pages.
- **Applications** — apply with a cover letter (no duplicates), status lifecycle
  (APPLIED → UNDER_REVIEW → SHORTLISTED → INTERVIEW → REJECTED → HIRED), seeker history and a
  recruiter applicant tracker with inline status updates.
- **Saved jobs** — save / unsave / list, with per-job flags on the detail page.

### Information Retrieval Engine (from scratch)
- **Shared query pipeline** — lowercase → tokenize → stop-word removal → light stemming; the *same*
  pipeline processes documents and queries so both live in one term space.
- **TF-IDF Vector Space Model** — log-normalized TF, smoothed IDF, sparse L2-normalized document
  vectors, cosine-similarity ranking.
- **BM25** — Okapi BM25 with k1 = 1.5, b = 0.75, term-frequency saturation and document-length
  normalization; always non-negative IDF.
- **Model comparison** — switch TF-IDF ↔ BM25 in the UI and inspect per-term score contributions
  (the two models demonstrably rank differently).
- **Controlled query expansion** — hand-curated one-directional alias dictionary
  (`js → javascript`, `ml → machine learning`, `node → node.js`, `db → database`, `reactjs → react`, …)
  with anti-over-expansion guards (max 3 expansions/query, no transitive chaining, no expansion
  when the target already appears). Toggle on/off; the UI shows *original → expanded*.
- **Search intent classifier** — a transparent **rule-based baseline** (Broder 2002 taxonomy)
  classifying queries as `INFORMATIONAL` / `NAVIGATIONAL` / `TRANSACTIONAL` with confidence and the
  matched lexical signals. Explicitly labeled *not* an ML model.
- **Personalized ranking** — a bounded re-ranker (up to +15% from skill overlap and
  preferred-location match) used as A/B variant B; `personalized` flag in the API response.

### Recommendation System
- **Content-based recommendations** — weighted match over skills (40%), role (25%), location (20%)
  and experience (15%), configurable via `RECOMMENDATION_WEIGHTS`. Returns a match %, per-dimension
  sub-scores, matched/missing skills, and human-readable reasons ("Matches your Java, Spring Boot,
  REST APIs skills", "Remote-friendly — works with any location preference").

### Web Analytics / Clickstream
- **Event tracking** — 12 event types (`PAGE_VIEW`, `SEARCH`, `JOB_VIEW`, `JOB_SAVE`, `JOB_UNSAVE`,
  `APPLY_START`, `APPLICATION_SUBMITTED`, `RECOMMENDATION_IMPRESSION`, `RECOMMENDATION_CLICK`,
  `FILTER_USED`, `SESSION_START`, `SESSION_END`) persisted with user, session, job, query,
  timestamp and JSON metadata.
- **Sessions & journeys** — sessions with start/end times; ordered per-session funnels and
  journeys reconstructible from timestamps.
- **Search analytics** — volume, top queries, search CTR, zero-result searches, searches over time.
- **Application funnel** — ordered per-session SEARCH → JOB_VIEW → APPLY_START →
  APPLICATION_SUBMITTED with conversions and drop-offs (monotonically non-increasing by design).
- **KPIs** — admin dashboard with platform KPIs, charts and tables, all derived from stored events.

### A/B Testing
- One experiment: **Variant A** = standard IR ranking (control) · **Variant B** = IR ranking +
  personalization re-ranker (treatment).
- Deterministic 50/50 hash assignment, persisted per user (sticky), seed-assigned for demo data.
- CTR and apply rate computed from **stored** SEARCH → JOB_VIEW → APPLICATION_SUBMITTED session
  funnels. **No significance claims without data** — the dashboard shows descriptive differences
  and an explicit "insufficient data" note below a minimum sample.

### IR Evaluation
- A manual TREC-style **qrels dataset** (8 queries, graded jobs 0–3 via deterministic
  title/location selectors — stable across re-seeds).
- Live computation of **P@10, R@10, F1, MRR, NDCG@5, NDCG@10** for TF-IDF **and** BM25 from the
  actual indexes — nothing is fabricated or hard-coded.
- Admin page `/admin/search-evaluation` with a summary table, per-query breakdowns and a
  **Run / Recalculate** button.

### Admin & Demo Pages
- `/admin` — KPI dashboard (overview, search analytics, application funnel, job analytics).
- `/admin/search-evaluation` — IR evaluation results.
- `/admin/abtest` — A/B experiment metrics.
- `/intelligence` — Search Intelligence: query processing, term statistics, per-term score
  breakdowns, expansion and intent — for TF-IDF and BM25.

---

## 🧰 Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, React Router 6, Vite 5, TypeScript |
| Backend    | Node.js, Express 4, TypeScript, Zod |
| ORM        | Prisma 6 (PostgreSQL) |
| Database   | PostgreSQL 16 (Docker) |
| Auth       | bcryptjs, jsonwebtoken |
| Analytics  | Custom clickstream engine over Prisma (pino logging) |
| Testing    | Vitest (backend), `tsc --noEmit` typechecks |
| Tooling    | docker compose, concurrently |

## 🏗 Architecture

```
┌────────────────────────┐        ┌───────────────────────────────────────────┐
│  React SPA (Vite)      │  /api  │  Express API (backend, :4000)             │
│  :5173                 │ ─────► │                                          │
│  pages/ api.ts         │  proxy │  controllers ── services                 │
│  tracking.ts (events)  │        │      │           ├─ ir/  (tokenizer,     │
└────────────────────────┘        │      │           │        tfidf, bm25,   │
                                  │      │           │        expansion,     │
                                  │      │           │        intent,        │
                                  │      │           │        metrics, eval) │
                                  │      │           ├─ recommendation       │
                                  │      │           ├─ analytics (funnel,   │
                                  │      │           │   search, jobs, KPIs) │
                                  │      │           └─ abtest               │
                                  │      └───────────┬───────────────────────┤
                                  └──────────────────│  Prisma ORM           │
                                                     ▼                       │
                                              ┌─────────────┐                │
                                              │ PostgreSQL  │  docker       │
                                              │ 16 (:5433)  │  compose      │
                                              └─────────────┘                │
                                                                             │
  Search pipeline (in-memory index, rebuilt on job changes):                 │
  jobs ──► processText (normalize→tokenize→stop-words→stem) ──► TF-IDF idx   │
                                                           ──► BM25 idx      │
  query ─► (expansion?) ─► processQuery ─► rank ─► (personalization?) ─► hits │
```

## 🚀 Quick Start

The fastest path (full setup guide: **[SETUP_GUIDE.md](SETUP_GUIDE.md)**):

> **Windows:** run all commands from `E:\wair-capstone` (the folder containing this README), not
> from `scripts`. Make sure Docker Desktop is running before starting the database.

```bash
# 1. Install everything + create .env files + start Postgres + migrate + seed
npm run setup

# 2. Start everything (recommended on Windows; starts DB and seeds an empty DB):
npm run start:all:windows

#    Or start only the backend and frontend after setup:
npm run dev
```

Then open **http://localhost:5173** and sign in with a demo account.

### Stop the project

Use the same terminal that is running the servers and press **Ctrl+C**, then run this from the
project root in a second PowerShell terminal:

```powershell
npm run db:down
```

This stops the backend, frontend, and PostgreSQL container while preserving database data. If
`Ctrl+C` does not stop the Node child processes on Windows, run this PowerShell cleanup command:

```powershell
Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Stop-Process -Force -ErrorAction SilentlyContinue
npm run db:down
```

To stop Docker Desktop completely after the project is down, use the Docker Desktop tray menu or:

```powershell
docker desktop stop
```

Do **not** use `docker compose down -v` for normal shutdown. The `-v` option permanently deletes
the PostgreSQL data volume.

### Demo accounts (password for all: `Password123!`)

| Role        | Email                       |
|-------------|-----------------------------|
| Job Seeker  | `demo.seeker@example.com`   |
| Recruiter   | `demo.recruiter@example.com`|
| Admin       | `demo.admin@example.com`    |

The seed creates 50 seekers, 10 recruiters, 15 companies, ~104 jobs, ~110 applications and a
realistic 30-day clickstream (420+ sessions) so every dashboard has meaningful data immediately.

## 📁 Project Structure

```
.
├── backend/                    # Express + Prisma + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma       # data model (users, jobs, events, sessions, …)
│   │   ├── migrations/         # SQL migrations (init, multi-company, ab_variant)
│   │   └── seed.ts             # demo data + clickstream generator
│   ├── src/
│   │   ├── app.ts / server.ts  # express app + bootstrap
│   │   ├── config/env.ts       # typed environment configuration
│   │   ├── controllers/        # request handlers (auth, jobs, search, misc)
│   │   ├── lib/                # auth (bcrypt/JWT), prisma client, errors, logger
│   │   ├── middleware/         # auth guards, attachUser, error handling
│   │   ├── routes/index.ts     # all API routes + zod validation
│   │   ├── schemas/            # zod schemas (analytics events, etc.)
│   │   └── services/
│   │       ├── ir/             # tokenizer, tfidf, bm25, metrics,
│   │       │                   # evaluation (qrels), queryExpansion, intent
│   │       ├── search.service.ts        # IR pipeline orchestration + personalization
│   │       ├── recommendation.service.ts # content-based recommender
│   │       ├── analytics.service.ts     # KPIs, search analytics, funnel, job analytics
│   │       ├── tracking.service.ts      # clickstream persistence + sessions
│   │       ├── abtest.service.ts        # A/B assignment + metrics
│   │       └── auth / profile / jobs / applications services
│   └── tests/                  # Vitest suite (83 tests)
├── frontend/                   # React + Vite + TypeScript SPA
│   └── src/
│       ├── pages/              # 16 pages (auth, jobs, recruiter, admin, demo)
│       ├── api.ts              # typed API client (Bearer auth)
│       ├── tracking.ts         # session id + clickstream helpers
│       ├── auth.ts             # AuthProvider / login / register / logout
│       └── types.ts            # shared API types
├── scripts/
│   ├── start-all.sh / .bat     # one-command launcher (DB + backend + frontend)
│   └── copy-env.mjs            # .env.example → backend/.env + frontend/.env
├── docker-compose.yml          # PostgreSQL 16 (host port 5433)
└── package.json                # root orchestration scripts
```

## 🔍 IR Engine Details

**Query/document pipeline** (`backend/src/services/ir/tokenizer.ts`):
`normalize → tokenize → stop-word removal → lightStem` — identical for docs and queries. The stemmer
is deliberately light ("developers" → "developer", "technologies" → "technology") and easy to
explain; it keeps "spring" intact.

**TF-IDF (VSM)** (`ir/tfidf.ts`):

```
tf(t,d)  = 1 + ln(rawTf)                       log-normalized term frequency
idf(t)   = ln((N + 1) / (df(t) + 1)) + 1       smoothed inverse document frequency
w(t,d)   = tf(t,d) · idf(t)
sim(q,d) = (q · d) / (‖q‖ · ‖d‖)               cosine similarity in |V|-space
```

**BM25** (`ir/bm25.ts`):

```
score(q,d) = Σ_{t∈q} IDF(t) · f(t,d)·(k1+1) / (f(t,d) + k1·(1 − b + b·|d|/avgdl))
k1 = 1.5,  b = 0.75,  IDF(t) = ln(1 + (N − df + 0.5)/(df + 0.5))   (≥ 0 always)
```

**Evaluation metrics** (`ir/metrics.ts`): P@10, R@10, F1@10, MRR, NDCG@5, NDCG@10. Binary metrics
use grade ≥ 2 as "relevant"; NDCG uses exponential gain `2^g − 1` and the **corpus-wide** ideal
ranking (a ranker that misses relevant docs is penalized).

**Example live output** (computed on request from the actual indexes over the seeded corpus — your
numbers will match the current data):

| Algorithm | Precision@10 | Recall@10 | F1 | MRR | NDCG@5 | NDCG@10 |
|-----------|-------------|-----------|----|-----|--------|---------|
| TF-IDF    | 0.1625      | 0.7125    | 0.2496 | 0.3545 | 0.2891 | 0.4176 |
| BM25      | 0.2125      | 0.8125    | 0.3163 | 0.4554 | 0.3513 | 0.5167 |

**Query expansion** (`ir/queryExpansion.ts`): 16 rules (`js`, `ml`, `ai`, `node`, `reactjs`,
`k8s`, `db`, `postgres`, `ts`, `oop`, `api`, …). Guards: max 3 expansions/query, no transitive
chaining, skip when the target term already appears. Opt-in via `?expand=1` / the UI toggle.

**Search intent** (`ir/intent.ts`): weighted lexical cues per Broder's taxonomy, returning the
winning class, confidence (winner's share of weighted evidence) and matched signals. Documented as
a **baseline**, not ML.

## 🧮 Analytics Model

- **Events** are stored in the `AnalyticsEvent` table (user, session, type, job, query, metadata,
  timestamp). Sessions live in the `Session` table with `startedAt`/`endedAt`.
- **Funnel** = ordered per-session reach: a session advances SEARCH → JOB_VIEW → APPLY_START →
  APPLICATION_SUBMITTED one stage at a time (prevents the classic "conversion > 100%" raw-count
  artifact).
- **CTR** = sessions with a JOB_VIEW after SEARCH ÷ sessions with SEARCH.
- **A/B metrics** use the same session funnel, attributed by persisted variant; significance is
  gated (≥ 30 search sessions per variant) and reported as descriptive only.

## 📡 API Overview (base path `/api`)

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/auth/register` · `/auth/login` · `/auth/logout` | public | auth |
| GET  | `/auth/me` | any authed | current user |
| GET/PUT | `/profile`, GET `/skills` | seeker | profile management |
| GET  | `/jobs`, `/jobs/:id` | public | job listing / detail |
| POST/PUT/DELETE | `/jobs`, `/jobs/:id` | recruiter | job CRUD |
| GET  | `/search/jobs?q&algorithm&expand&sessionId` | public | IR search (TF-IDF/BM25) |
| GET  | `/search/explain?q&algorithm&expand` | public | Search Intelligence |
| GET  | `/search/evaluation` | admin | run IR evaluation |
| POST | `/jobs/:id/apply` | seeker | apply to job |
| GET  | `/applications` | seeker | my applications |
| GET/PUT | `/recruiter/applicants`, `/recruiter/applicants/:id/status` | recruiter | applicant tracking |
| POST/DELETE/GET | `/jobs/:id/save`, `/saved-jobs`, `/saved-jobs/flags` | seeker | saved jobs |
| GET  | `/recommendations/jobs` | seeker | content-based recommendations |
| POST | `/analytics/events` | public (validated) | clickstream ingestion |
| GET  | `/analytics/overview` · `/search` · `/funnel` · `/jobs` | admin | analytics dashboards |
| GET/POST | `/abtest/summary`, `/abtest/assign-missing` | admin | A/B experiment |
| GET  | `/recruiter/jobs`, `/recruiter/jobs/:id/analytics`, `/recruiter/overview` | recruiter | recruiter analytics |
| GET  | `/health` | public | uptime probe |

## 📜 npm Scripts (root)

| Script | What it does |
|--------|--------------|
| `npm run setup` | install all deps, create `.env` files, start Postgres, migrate, seed |
| `npm run start:all` | one-command launcher: DB + backend + frontend (see `scripts/start-all.sh`) |
| `npm run dev` | start backend (tsx watch) + frontend (Vite) together |
| `npm run dev:backend` / `dev:frontend` | start one side only |
| `npm run seed` | reseed the database with demo data |
| `npm test` | backend Vitest suite |
| `npm run typecheck` | `tsc --noEmit` for backend + frontend |
| `npm run build` | production build for backend + frontend |
| `npm run db:up` / `db:down` | start / stop the PostgreSQL container |

## ✅ Testing

83 backend tests (Vitest): tokenizer/TF-IDF/BM25 behavior, model-difference tests, IR metrics,
query expansion + intent classifier, recommendation scoring, analytics invariants, and end-to-end
API tests (auth, RBAC, jobs, applications, search, evaluation). Frontend is typechecked
(`tsc --noEmit`) and production-built with Vite.

## 🎓 Academic Honesty Notes

- **Evaluation numbers are computed live** from the actual TF-IDF/BM25 indexes over the manual qrels
  dataset — nothing is hard-coded or fabricated. The qrels judgments themselves are a small,
  documented, human-made dataset (TREC-style selectors).
- The **intent classifier is a rule-based baseline** (weighted lexical cues), explicitly not an ML
  model, and the UI says so.
- The **A/B experiment reports descriptive differences only** and refuses significance claims
  below a minimum sample size.
- The **recommendation weights** are baseline experimental values, stated as such, and configurable.

## 🔮 Out of Scope (future)

Real-time analytics, session-based recommendations, collaborative filtering, semantic/vector
search, advanced ML intent/ranking, advanced resume parsing, Elasticsearch, Kafka, Kubernetes.