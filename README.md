# SmartHire

Intelligent Workforce Orchestration & Recruitment Platform.
**Module 2 — Application Workflow + Publishing Pipeline** (on top of Module 1, Foundation +
Core Services).

Jobs, candidates and applications with the hiring rules enforced in the database
(duplicates, eligibility, limits — correct under concurrency). Publishing runs as a
**Temporal workflow** that extracts skills, keywords and a structured breakdown of the
description, and marks a job ready only when all of it is stored. Each application is
tracked stage by stage, scored, and confirmed exactly once; retried requests are made
safe with **idempotency keys in Redis**.

![A published job: workflow status, structured content and a scored application](docs/images/m2-job-published.png)

## Quick start

```bash
cp .env.example .env          # every setting, with defaults — edit as needed
cd frontend && npm install && npm run build && cd ..
docker compose up --build
docker compose run --rm seed  # a recruiter, demo data, deliberate rule violations
```

Sign in at http://localhost:3000 as `recruiter@example.com`, or as any seeded candidate
(e.g. `ayesha.khan@example.com`), with `SEED_PASSWORD` from `.env`. Candidates can also
create their own account at `/register`.

> **Upgrading a stack from before authentication?** Add `JWT_SECRET_KEY`,
> `SEED_RECRUITER_EMAIL` and `SEED_PASSWORD` to your `.env` (see `.env.example`) — the
> API refuses to start without the key. The migration gives existing candidates
> accounts with **no password**, which cannot sign in, so the old demo candidates stay
> unusable; `docker compose down -v` and re-seed for a full demo. That deletes the
> local database.

| Surface | URL |
|---|---|
| Console — recruiters and candidates | http://localhost:3000 |
| API | http://localhost:8000 |
| Interactive API docs | http://localhost:8000/docs |
| Temporal UI — every workflow run | http://localhost:8233 |
| PostgreSQL / Redis | localhost:5432 / localhost:6379 |
| pgAdmin (optional: `docker compose up -d pgadmin`) | http://localhost:5050 |

Every port and setting is configurable — see [.env.example](.env.example).

> The frontend is built on the host rather than inside its image because this network's
> TLS inspection breaks `npm install` in containers. See
> [frontend/README.md](frontend/README.md#known-environment-issues).

## Services

```mermaid
flowchart LR
    Browser --> web["web · nginx<br/>SPA + /api proxy"]
    web --> api["api · FastAPI"]
    api --> db[("db · PostgreSQL 17")]
    api -->|start workflows| temporal[("temporal<br/>engine + UI")]
    api --> redis[("redis<br/>idempotency")]
    worker["worker<br/>workflows + activities"] -->|poll| temporal
    worker --> db
    migrate["migrate · alembic<br/>runs once"] -.->|must exit 0| api
```

| Service | Role |
|---|---|
| `db` | PostgreSQL — the source of truth; every rule is a constraint or a locked check |
| `migrate` | `alembic upgrade head`, then exits; `api` and `worker` wait for it |
| `api` | FastAPI: validates, enforces rules, starts workflows |
| `worker` | Runs the `PublishJob` and `ProcessApplication` workflows (`app/worker.py`) |
| `temporal` | Workflow engine: records every step, retries, resumes after crashes |
| `redis` | Idempotency records, with expiry |
| `web` | The recruiter console, proxying `/api` |
| `seed` | On demand: `docker compose run --rm seed` — creates the recruiter, then seeds through the API |
| `pgadmin` | On demand: `docker compose up -d pgadmin`; database password from `.env` |

Temporal or Redis being down degrades the platform rather than stopping it: reads and
applications keep working; publishing waits. See [docs/WORKFLOWS.md](docs/WORKFLOWS.md#5-failure-modes).

## Repository

```
backend/     FastAPI, SQLAlchemy, Alembic, Temporal workers — organised by domain
frontend/    React + TypeScript console, built with Vite
docs/        PRD, architecture, workflows, database, migrations
scripts/     seed.py (demo data via the API), index-benchmark/
```

## Documentation

| Document | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Use cases, requirements and traceability — Module 1 and Module 2 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Services, domain packages, 26 design decisions with tradeoffs |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | The two Temporal workflows, every failure mode, how to watch and demo them |
| [docs/DATABASE.md](docs/DATABASE.md) | Normalisation, constraints, indexes with measurements, concurrency |
| [docs/MIGRATIONS.md](docs/MIGRATIONS.md) | How Alembic works here, the mistakes it caught, and seeing it all in pgAdmin |
| [backend/README.md](backend/README.md) | API reference, error codes, business rules, tests |
| [frontend/README.md](frontend/README.md) | Vite-over-Next.js rationale, generated API types |

## Tests

```bash
docker compose up -d db temporal redis
cd backend && pytest        # 215 tests: real Postgres, real Temporal, real Redis
ruff check .
cd ../frontend && npm run typecheck
```

Tests needing Temporal or Redis skip with a clear message when those are not running.

## Module roadmap

| Module | Scope | Status |
|---|---|---|
| 1 | Foundation + core services | **Complete** — revised after review, with authentication |
| 2 | Application workflow + publishing pipeline (Temporal) | **Complete** |
| 3 | Event-driven system (Kafka, outbox, analytics) + observability | Next |
| 4 | Semantic layer — embeddings, vector search | Later |
| 5 | AI assistant — LangGraph, recommendations | Later |

## Authentication

Every endpoint except the health probes and `/auth/register|login|refresh|logout` needs a
signed-in user, declared once for every router rather than route by route. Recruiters
run the hiring side; candidates see published jobs and only their own profile and
applications. Short-lived JWT access tokens, refresh tokens that rotate on every use,
Argon2id password hashes. Recruiter accounts are created from the command line:

```bash
docker compose exec api python -m app.auth.cli create-recruiter alice@example.com --name "Alice Ahmed"
```

Design and tradeoffs: [docs/ARCHITECTURE.md §4.22–4.26](docs/ARCHITECTURE.md#422-short-lived-jwts-and-refresh-tokens-that-rotate).
Remaining gaps (password reset, rate limiting): [§5](docs/ARCHITECTURE.md#5-gaps).
