# SmartHire — Backend

Core recruitment platform for SmartHire. **Modules 1 and 2:** foundation and core
services, plus the application workflow and the job publishing pipeline.

Job and candidate management with the brief's three rules — duplicate applications,
eligibility, application limits — enforced under concurrency; job publishing as a
Temporal workflow that extracts structured content; application tracking, scoring and
confirmation; idempotent creates.

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
| Workflows | Temporal (Python SDK) | Durable, retried, observable multi-step processes |
| Cache | Redis | Idempotency records with expiry |
| Tests | pytest + httpx | In-process ASGI transport; real Postgres, Temporal and Redis |
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
- Temporal UI: http://localhost:8233
- Postgres: `localhost:5432` · Redis: `localhost:6379`

Compose starts `db`, then a one-shot `migrate` that runs `alembic upgrade head`, and
only then `api` and `worker`. Neither ever runs against an out-of-date schema. The worker
does not hot-reload: `docker compose restart worker` after editing workflow code.

### Configuration

Every setting is an environment variable, read and validated by
[app/core/config.py](app/core/config.py). The root [.env.example](../.env.example) lists
all of them with their defaults. The backend reads the root `.env` and then
`backend/.env` (personal overrides); real environment variables win over both.

`POSTGRES_PASSWORD` is the one setting with no default in code: the backend and Compose
both refuse to start without it (or, for the backend, a full `DATABASE_URL`). With
`ENVIRONMENT=production`, the backend also refuses `PUBLISHING_FAULT_RATE` above 0.

| Group | Variables |
|---|---|
| Database | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — or one `DATABASE_URL` |
| Pool | `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SECONDS`, `DB_POOL_RECYCLE_SECONDS`, `DB_ECHO` |
| App | `APP_NAME`, `ENVIRONMENT`, `LOG_LEVEL` |
| Rules | `MAX_APPLICATIONS_PER_CANDIDATE`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` |
| Temporal | `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE` |
| Workflows | `PUBLISHING_MAX_ATTEMPTS`, `PUBLISHING_FAULT_RATE`, `APPLICATION_PROCESSING_MAX_ATTEMPTS`, `WORKER_SHUTDOWN_GRACE_SECONDS` |
| Redis | `REDIS_URL`, `REDIS_TIMEOUT_SECONDS`, `IDEMPOTENCY_TTL_SECONDS`, `IDEMPOTENCY_LOCK_SECONDS` |
| Tests | `TEST_DATABASE_NAME`, `TEST_REDIS_URL` |

### Without Docker — API local, Postgres in a container

```bash
docker compose up -d db

python -m venv .venv
.\.venv\Scripts\Activate.ps1      # PowerShell. macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"

alembic upgrade head
uvicorn app.main:app --reload
python -m app.worker              # in a second terminal, with Temporal running
```

## API

All paths, with the interactive version at `/docs` (sign in with `/auth/login`, then
paste the access token into **Authorize**).

### Authentication

Every endpoint needs `Authorization: Bearer <access token>` except these, and the
health probes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | A candidate creates their account and profile. Does not sign in |
| POST | `/auth/login` | Email + password → access token (15 min) + refresh token |
| POST | `/auth/refresh` | Refresh token → a new pair. Each refresh token works once |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/auth/me` | The signed-in user (requires a token) |

Recruiters are not created over HTTP:

```bash
docker compose exec api python -m app.auth.cli create-recruiter alice@example.com
```

**Roles.** A recruiter manages jobs, publishing and the hiring pipeline, and reads every
candidate and application. A candidate reads published jobs, applies as themselves, and
reads, edits and withdraws only their own profile and applications. Another user's
profile or application answers 404, as if it did not exist. Full table:
[ARCHITECTURE.md §4.25](../docs/ARCHITECTURE.md#425-secure-by-default-roles-at-the-boundary-404-for-other-peoples-data).

### Jobs

| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | List. Filters: `status`, `skill`, `search`, `limit`, `offset`. Candidates get published jobs only |
| POST | `/jobs` | Create — always as a draft |
| GET | `/jobs/{job_id}` | Fetch one |
| PATCH | `/jobs/{job_id}` | Partial update; unsent fields untouched |
| DELETE | `/jobs/{job_id}` | Delete; applications cascade |
| POST | `/jobs/{job_id}/publish` | **202** — starts the publishing workflow; job → `processing` |
| GET | `/jobs/{job_id}/publication` | Job status + workflow status + live step |
| GET | `/jobs/{job_id}/content` | Extracted sections, keywords, mentioned skills |
| POST | `/jobs/{job_id}/close` | → closed |
| POST | `/jobs/{job_id}/reopen` | closed → draft |

### Candidates

| Method | Path | Purpose |
|---|---|---|
| GET | `/candidates` | List (recruiters). Filters: `skill`, `search`, `min_experience` |
| GET | `/candidates/{candidate_id}` | Fetch one — a candidate only their own |
| PATCH | `/candidates/{candidate_id}` | Update your profile (email excluded) |
| DELETE | `/candidates/{candidate_id}` | Delete your account, profile and applications |

A candidate's id is their account's id, so `/auth/me` gives it. Registering is
`POST /auth/register`.

### Applications

| Method | Path | Purpose |
|---|---|---|
| POST | `/jobs/{job_id}/applications` | Apply as the signed-in candidate — enforces all three rules |
| GET | `/jobs/{job_id}/applications` | Applications for one job |
| GET | `/applications` | List. Filters: `job_id`, `candidate_id`, `stage`. A candidate gets their own |
| GET | `/applications/{application_id}` | Fetch one |
| POST | `/applications/{application_id}/stage` | Advance through the pipeline |
| DELETE | `/applications/{application_id}` | Withdraw (the candidate) — moves to `withdrawn`, keeps the row |
| GET | `/applications/{application_id}/history` | Every stage change, oldest first |
| GET | `/applications/{application_id}/notifications` | Messages sent about it |
| POST | `/applications/{application_id}/process` | **202** — (re)run scoring and the confirmation |

`POST /jobs` and `POST /jobs/{job_id}/applications` accept an `Idempotency-Key` header:
a retry with the same key and body, from the same user, gets the original response
(marked `Idempotent-Replayed: true`) and performs nothing twice. Registration does not:
its body carries a password — see `app/auth/router.py`.

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
| `not_authenticated` | 401 | No access token |
| `invalid_token` | 401 | Access token forged, expired, or its user deleted — refresh, then sign in |
| `invalid_credentials` | 401 | Wrong email or password (one answer for both) |
| `invalid_refresh_token` | 401 | Refresh token unknown, expired or already used — sign in |
| `forbidden` | 403 | Your role cannot do this |
| `not_found` | 404 | No such job, candidate, or application — or not yours to see |
| `duplicate_email` | 409 | An account with this email already exists |
| `duplicate_application` | 409 | Candidate already applied to this job |
| `job_not_open` | 409 | The job's state refuses it: applying to a job that is not `published`, editing one that is `processing` or `closed`, publishing a closed job, reopening one that is not closed |
| `not_eligible` | 422 | Experience or skills do not meet the job's requirements |
| `application_limit_reached` | 409 | Candidate is at their active application limit |
| `job_capacity_reached` | 409 | Job hit its `max_applications` cap |
| `invalid_stage_transition` | 409 | Illegal move through the hiring pipeline |
| `idempotency_in_progress` | 409 | Same Idempotency-Key, first request still running |
| `idempotency_key_reused` | 422 | Same Idempotency-Key, different body |
| `workflow_unavailable` | 503 | Temporal unreachable; nothing was changed |
| `internal_error` | 500 | Unexpected; details are logged, not returned |

## Business rules

**Duplicate applications.** A unique constraint on `(job_id, candidate_id)`. The service
also pre-checks to return a friendly 409 on the common path, but the constraint is what
makes the rule true — two concurrent requests can both pass a Python check before either
writes.

**Eligibility.** The job must be `published` (not `processing`); the candidate must meet
`min_experience_years`; if the job lists `required_skills`, the candidate must have at
least one of them.

**Application limits.** A candidate may hold `MAX_APPLICATIONS_PER_CANDIDATE` (default 10)
applications in non-terminal stages. `hired`, `rejected` and `withdrawn` do not count, so
a rejected candidate is not locked out. A job may also set `max_applications` as its own
cap. Both counts are taken under row locks, so they hold under concurrent requests.

**Stage machine.** `applied → screening → interview → offer → hired`, with `rejected`
(the recruiter's decision) and `withdrawn` (the candidate's) reachable from any active
stage. All three terminal stages are final. Skipping a stage is rejected, so the
conversion funnel that later modules report describes what actually happened. Every
move is recorded in the application's history.

## Layout

Organised by domain, then by layer — see
[ARCHITECTURE.md §2](../docs/ARCHITECTURE.md#2-packages-and-layers).

```
app/
├── main.py            FastAPI app: middleware, handlers, router table
├── worker.py          Temporal worker: registers every workflow and activity
├── models.py          Model registry, read by Alembic
├── health.py          Liveness and readiness (Postgres, Temporal, Redis)
├── core/              config, db, base models, errors, schemas, pagination, logging,
│                      temporal client, redis client, idempotency
├── auth/              users and refresh tokens · security (hashing, JWTs) ·
│                      dependencies (who is calling) · router · cli
├── jobs/              models · schemas · service · router · errors · enums
├── publishing/        content analysis · activities · workflow · publisher · router
├── candidates/        models · schemas · service · router · errors
├── applications/      models · schemas · service · router · errors · enums
│                      scoring · activities · workflow · processor
├── notifications/     the record of every message sent
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

202 tests. They run against a `smarthire_test` database, created on demand, whose tables
are dropped at the end; `test_migrations.py` replays the whole migration history against its own
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
- [Workflows — publishing and application processing](../docs/WORKFLOWS.md)

## Module roadmap

| Module | Scope | Status |
|---|---|---|
| 1 | Foundation + core services | **Complete** — authentication added after review |
| 2 | Application workflow + publishing pipeline | **Complete** — see [docs/WORKFLOWS.md](../docs/WORKFLOWS.md) |
| 3 | Event-driven system + observability | Next |
| 4 | Semantic layer — embeddings, vector search | Later |
| 5 | AI assistant — LangGraph, recommendations | Later |
