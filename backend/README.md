# SmartHire — Backend

Core recruitment platform for SmartHire. **Module 1: Foundation + Core Services.**

Job and candidate management, the application pipeline, and the three business rules the
brief names: duplicate applications, eligibility checks, and application limits.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.13 | Assignment stack |
| Framework | FastAPI | ASGI application; derives validation and OpenAPI from type hints |
| Server | Uvicorn | ASGI server; separable from the app |
| Database | PostgreSQL 17 | Constraints, arrays, native enums |
| ORM | SQLAlchemy 2.0 async + asyncpg | Async all the way down, no blocking driver |
| Migrations | Alembic | Reviewable, reversible schema history |
| Config | pydantic-settings | Every setting from an environment variable, validated at startup |
| Tests | pytest + httpx | In-process ASGI transport, real Postgres |
| Local infra | Docker Compose | One command to a working stack |

## Running it

### With Docker — everything, one command

```bash
cp .env.example .env          # at the repository root
docker compose up --build
docker compose run --rm seed  # optional: demo data
```

- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Postgres: `localhost:5432`

Compose starts `db`, then a one-shot `migrate` that runs `alembic upgrade head`, and
only then `api`. The API therefore never starts against an out-of-date schema.

### Configuration

Every setting is an environment variable, read and validated by
[app/core/config.py](app/core/config.py). The root [.env.example](../.env.example) lists
all of them with their defaults. The backend reads the root `.env` and then
`backend/.env` (personal overrides); real environment variables win over both.

| Group | Variables |
|---|---|
| Database | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — or one `DATABASE_URL` |
| Pool | `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SECONDS`, `DB_POOL_RECYCLE_SECONDS`, `DB_ECHO` |
| App | `APP_NAME`, `ENVIRONMENT`, `LOG_LEVEL` |
| Rules | `MAX_APPLICATIONS_PER_CANDIDATE`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` |
| Tests | `TEST_DATABASE_NAME` |

### Without Docker — API local, Postgres in a container

```bash
docker compose up -d db

python -m venv .venv
.\.venv\Scripts\Activate.ps1      # PowerShell. macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"

alembic upgrade head
uvicorn app.main:app --reload
```

## API

All paths, with the interactive version at `/docs`.

### Jobs

| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | List. Filters: `status`, `skill`, `search`, `limit`, `offset` |
| POST | `/jobs` | Create — always as a draft |
| GET | `/jobs/{job_id}` | Fetch one |
| PATCH | `/jobs/{job_id}` | Partial update; unsent fields untouched |
| DELETE | `/jobs/{job_id}` | Delete; applications cascade |
| POST | `/jobs/{job_id}/publish` | draft → published |
| POST | `/jobs/{job_id}/close` | → closed |
| POST | `/jobs/{job_id}/reopen` | closed → draft |

### Candidates

| Method | Path | Purpose |
|---|---|---|
| GET | `/candidates` | List. Filters: `skill`, `search`, `min_experience` |
| POST | `/candidates` | Register |
| GET | `/candidates/{candidate_id}` | Fetch one |
| PATCH | `/candidates/{candidate_id}` | Update profile (email excluded) |
| DELETE | `/candidates/{candidate_id}` | Delete |

### Applications

| Method | Path | Purpose |
|---|---|---|
| POST | `/jobs/{job_id}/applications` | Apply — enforces all three rules |
| GET | `/jobs/{job_id}/applications` | Applications for one job |
| GET | `/applications` | List. Filters: `job_id`, `candidate_id`, `stage` |
| GET | `/applications/{application_id}` | Fetch one |
| POST | `/applications/{application_id}/stage` | Advance through the pipeline |
| DELETE | `/applications/{application_id}` | Withdraw |

### Skills

| Method | Path | Purpose |
|---|---|---|
| GET | `/skills` | The shared skill vocabulary. Filter: `search` (prefix) |

Skills are created implicitly when a job or candidate first lists one.

### Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness — process is up. Checks nothing else. |
| GET | `/health/ready` | Readiness — 503 if Postgres is unreachable |

Separate on purpose: a liveness probe that checks the database reports the API as dead
during a brief database blip, and an orchestrator then restarts a healthy process.

## Errors

Every failure — including FastAPI's own validation errors — returns one shape:

```json
{
  "error": {
    "code": "duplicate_application",
    "message": "This candidate has already applied to this job.",
    "request_id": "74dfeaec055e4a57b4ab96de62c473d1"
  }
}
```

`code` is stable and safe to branch on. `request_id` appears on every log line for that
request and in the `X-Request-ID` response header.

| Code | HTTP | Meaning |
|---|---|---|
| `validation_error` | 422 | Request body or query failed schema validation |
| `not_found` | 404 | No such job, candidate, or application |
| `duplicate_email` | 409 | Candidate email already registered |
| `duplicate_application` | 409 | Candidate already applied to this job |
| `job_not_open` | 409 | Job is draft or closed |
| `not_eligible` | 422 | Experience or skills do not meet the job's requirements |
| `application_limit_reached` | 409 | Candidate is at their active application limit |
| `job_capacity_reached` | 409 | Job hit its `max_applications` cap |
| `invalid_stage_transition` | 409 | Illegal move through the hiring pipeline |
| `internal_error` | 500 | Unexpected; details are logged, not returned |

## Business rules

**Duplicate applications.** A unique constraint on `(job_id, candidate_id)`. The service
also pre-checks to return a friendly 409 on the common path, but the constraint is what
makes the rule true — two concurrent requests can both pass a Python check before either
writes.

**Eligibility.** The job must be `published`; the candidate must meet
`min_experience_years`; if the job lists `required_skills`, the candidate must have at
least one of them.

**Application limits.** A candidate may hold `MAX_APPLICATIONS_PER_CANDIDATE` (default 10)
applications in non-terminal stages. `hired` and `rejected` do not count, so a rejected
candidate is not locked out. A job may also set `max_applications` as its own cap.

**Stage machine.** `applied → screening → interview → offer → hired`, with `rejected`
reachable from any active stage. Both terminal stages are final. Skipping a stage is
rejected, so the conversion funnel that later modules report describes what actually
happened.

## Layout

Organised by domain, then by layer — see
[ARCHITECTURE.md §2](../docs/ARCHITECTURE.md#2-packages-and-layers).

```
app/
├── main.py            FastAPI app: middleware, handlers, router table
├── models.py          Model registry, read by Alembic
├── health.py          Liveness and readiness
├── core/              config, db, base models, errors, schemas, pagination, logging
├── jobs/              models · schemas · service · router · errors · enums
├── candidates/        models · schemas · service · router · errors
├── applications/      models · schemas · service · router · errors · enums
└── skills/            models · schemas · service · router
migrations/            Alembic revisions — see docs/MIGRATIONS.md
tests/
```

Each domain's `schemas.py` and `models.py` stay separate. Services take a session and
raise their domain's `DomainError` subclasses, so they are callable from a Temporal
activity or a worker without dragging FastAPI along.

## Tests

```bash
docker compose up -d db     # the suite needs a real Postgres
pytest
```

50 tests. They run against a `smarthire_test` database, created on demand and dropped at
the end; `test_migrations.py` replays the whole migration history against its own
scratch database. Deliberately not SQLite: the unique constraint, array containment and native
enums either behave differently there or do not exist, and a suite that passes on a
database you do not deploy proves very little.

```bash
ruff check .                # lint
alembic upgrade head        # apply migrations
alembic downgrade -1        # roll one back
alembic check               # fail if models and migrations disagree
```

## Documentation

- [Product Requirements Document](../docs/PRD.md)
- [Architecture and design decisions](../docs/ARCHITECTURE.md)
- [Database design — normalisation, indexes, concurrency](../docs/DATABASE.md)
- [How migrations work](../docs/MIGRATIONS.md)

## Module roadmap

| Module | Scope | Status |
|---|---|---|
| 1 | Foundation + core services | **This** |
| 2 | Business logic + Temporal workflows | Next |
| 3 | Event-driven system + observability | Later |
| 4 | Semantic layer — embeddings, vector search | Later |
| 5 | AI assistant — LangGraph, recommendations | Later |

Out of scope here: Temporal, Kafka, Celery, OpenTelemetry, GenAI. The seams they will
attach to — the publishing transition, the service layer, the request-id context — are in
place.
