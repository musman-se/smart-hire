# SmartHire — Product Requirements Document

**Module 1: Foundation + Core Services**
Author: Muhammad Usman · Version 1.0 · 21 September 2026

---

## 1. Context

TalentSphere Inc. is building SmartHire, a workforce orchestration and recruitment
automation platform for fast-scaling enterprises, staffing agencies and global HR teams.
Their existing systems have hit five limits:

- Job posting, candidate evaluation and interview operations are manual and slow.
- Recruiters cannot identify top candidates — there is no intelligent search or ranking.
- Hiring workflows are inconsistent and error-prone because data is scattered.
- Hiring campaigns cause delays in scheduling, shortlisting and background processing.
- Rich hiring data is not used for insight, prediction or recruiter assistance.

Module 1 addresses the foundation those problems sit on: a consistent, queryable core of
jobs, candidates and applications, with the hiring rules enforced rather than assumed.
Intelligence and scale are later modules and are explicitly out of scope here.

## 2. Goals

**In scope for Module 1**

1. Recruiters can create, update and manage job postings through a documented API.
2. Candidates can register and maintain a profile.
3. Candidates can apply to jobs, with the platform enforcing duplicate prevention,
   eligibility and application limits.
4. Applications progress through defined hiring stages, and illegal transitions are refused.
5. The whole stack runs locally with one command, against a schema under migration control.

**Explicitly out of scope**

Workflow orchestration (Temporal), event streaming (Kafka), background workers (Celery),
observability tooling (OpenTelemetry, Prometheus, Jaeger), and the GenAI layer.
Module 1 is judged on foundation quality, not surface area.

**Non-goals**

Authentication and authorisation. Every endpoint is currently unauthenticated — see
[§7 Assumptions](#7-assumptions).

## 3. Users

| User | Needs from Module 1 |
|---|---|
| **Recruiter** | Create and publish jobs, define requirements, review applicants, advance them through stages |
| **Candidate** | Register, maintain a profile, browse published jobs, apply, track status |
| **Platform engineer** | Run the stack locally, migrate the schema, read errors that identify themselves |

## 4. Use cases

| ID | Use case | Actor | Acceptance |
|---|---|---|---|
| UC-1 | Create a job posting | Recruiter | Job is stored as a draft; client cannot force `published` |
| UC-2 | Publish a job | Recruiter | Status becomes `published`, `published_at` is set; republishing is a no-op |
| UC-3 | Close and reopen a job | Recruiter | Closed jobs reject edits and applications; reopening returns to draft |
| UC-4 | Search jobs | Candidate | Filter by status, required skill, title substring; paginated with a true total |
| UC-5 | Register as a candidate | Candidate | Profile created; duplicate email rejected with `duplicate_email` |
| UC-6 | Update a profile | Candidate | Unsent fields unchanged; email cannot be changed via PATCH |
| UC-7 | Apply to a job | Candidate | Application created in `applied`, subject to UC-8..UC-10 |
| UC-8 | Prevent duplicate applications | Platform | Second application to the same job returns `duplicate_application`, guaranteed by a unique constraint |
| UC-9 | Enforce eligibility | Platform | Insufficient experience or no overlapping skill returns `not_eligible` |
| UC-10 | Enforce application limits | Platform | Candidate limit and per-job cap both enforced; terminal stages free a slot |
| UC-11 | Advance an application | Recruiter | Legal transitions succeed; skipping a stage returns `invalid_stage_transition` |
| UC-12 | Withdraw an application | Candidate | Application removed; job and candidate untouched |
| UC-13 | Operate the service | Engineer | Liveness and readiness probes; every error carries a correlatable request id |

## 5. Functional requirements

### 5.1 Job management

| ID | Requirement |
|---|---|
| FR-1.1 | Create a job with title, description, department, location, employment type, required skills, minimum experience, optional application cap |
| FR-1.2 | Every job is created as `draft`; status is not client-settable at creation |
| FR-1.3 | Partial update via PATCH; omitted fields are left unchanged |
| FR-1.4 | Lifecycle transitions are named actions (`/publish`, `/close`, `/reopen`), not field edits |
| FR-1.5 | Closed jobs reject edits |
| FR-1.6 | Required skills are trimmed, lowercased and de-duplicated on input |
| FR-1.7 | List jobs filtered by status, skill or title, paginated, returning the unpaginated total |
| FR-1.8 | Deleting a job cascades to its applications |

### 5.2 Candidate management

| ID | Requirement |
|---|---|
| FR-2.1 | Register with a validated, unique email address |
| FR-2.2 | Emails are normalised to lowercase, making uniqueness effectively case-insensitive |
| FR-2.3 | Profile carries name, phone, headline, years of experience, skills, resume URL |
| FR-2.4 | Email cannot be changed through the profile update endpoint |
| FR-2.5 | List candidates filtered by skill, name or minimum experience |

### 5.3 Applications

| ID | Requirement |
|---|---|
| FR-3.1 | A candidate applies to a job; the application is created in stage `applied` |
| FR-3.2 | A candidate may not hold two applications to the same job — enforced by database constraint |
| FR-3.3 | Applications are accepted only for `published` jobs |
| FR-3.4 | Candidate experience must meet the job's minimum |
| FR-3.5 | If the job lists required skills, the candidate must hold at least one |
| FR-3.6 | A candidate may hold at most `MAX_APPLICATIONS_PER_CANDIDATE` non-terminal applications |
| FR-3.7 | A job may define `max_applications` as its own cap |
| FR-3.8 | Stage transitions follow `applied → screening → interview → offer → hired`, with `rejected` reachable from any active stage |
| FR-3.9 | Terminal stages (`hired`, `rejected`) cannot be left |
| FR-3.10 | Applications listable by job, candidate and stage |

### 5.4 Platform

| ID | Requirement |
|---|---|
| FR-4.1 | Liveness and readiness probes, distinct, with readiness checking the database |
| FR-4.2 | One error envelope for every failure, including validation errors |
| FR-4.3 | Every request carries a request id, present in logs and in `X-Request-ID` |
| FR-4.4 | Interactive OpenAPI documentation at `/docs` |
| FR-4.5 | Schema changes applied through Alembic migrations, never ad hoc |

## 6. Non-functional requirements

| ID | Requirement | How it is met |
|---|---|---|
| NFR-1 | **Correctness under concurrency** — rules must hold when requests interleave | Uniqueness enforced by database constraints, not application checks |
| NFR-2 | **Data integrity** | Foreign keys with `ON DELETE CASCADE`, check constraints on non-negative values, `NOT NULL` throughout |
| NFR-3 | **Non-blocking I/O** | Async stack end to end: FastAPI, SQLAlchemy async, asyncpg. No blocking driver on the event loop |
| NFR-4 | **Bounded responses** | Pagination on every list endpoint with a hard ceiling of 100 rows |
| NFR-5 | **Query performance** | Indexes on every foreign key and filtered column; GIN indexes for skill array containment |
| NFR-6 | **Diagnosability** | Request id on every log line and response; readiness reports dependency state |
| NFR-7 | **Reproducibility** | Pinned Python version, declared dependencies, `docker compose up` from clean |
| NFR-8 | **Safe failure** | Unexpected errors log a stack trace but return a generic message, leaking no schema detail |
| NFR-9 | **Schema evolvability** | Alembic migrations, reversible, applied before the app starts |
| NFR-10 | **Testability** | 35 tests against real Postgres; services independently callable without HTTP |

## 7. Assumptions

1. **No authentication.** Recruiter and candidate roles are modelled in the data but not
   enforced at the boundary. Any client may call any endpoint. This is the largest known
   gap; it belongs in a later module, and every endpoint would sit behind a dependency
   resolving the caller.
2. **Skill matching is exact-string.** "postgres" and "postgresql" are different skills.
   Semantic matching is the entire point of Module 4 and is deliberately not faked here.
3. **Eligibility requires one overlapping skill, not all.** Requiring every listed skill
   would reject reasonable candidates; the brief does not specify, so the looser rule was
   chosen and documented rather than assumed.
4. **Offset pagination.** Simple and adequate at this scale. It drifts when rows are
   inserted mid-scroll; keyset pagination is the fix when volume demands it.
5. **Single API instance.** No distributed coordination is needed because correctness
   rests on database constraints, which hold across any number of instances.
6. **Resume handling is a URL, not an upload.** File storage and resume parsing are later
   modules.

## 8. Milestones

| Phase | Scope | Status |
|---|---|---|
| 0 | Project skeleton, Docker, Postgres, health probes | Complete |
| 1 | Schemas, models, migrations | Complete |
| 2 | Job and candidate CRUD with filtering and pagination | Complete |
| 3 | Applications: duplicates, eligibility, limits, stage machine | Complete |
| 4 | Layering, config, error envelope, request-id logging, tests | Complete |
| 5 | PRD, README, architecture documentation | Complete |
| — | **Module 1 review** | 28 September 2026 |

## 9. Traceability

| Requirement | Implementation | Test |
|---|---|---|
| FR-1.2 | `job_service.create_job` forces `JobStatus.DRAFT` | `test_client_cannot_create_an_already_published_job` |
| FR-1.3 | `model_dump(exclude_unset=True)` in `update_job` | `test_patch_leaves_unsent_fields_alone` |
| FR-1.4 | `POST /jobs/{id}/publish` in `routers/jobs.py` | `test_publish_sets_status_and_timestamp` |
| FR-1.5 | `JobNotOpenError` guard in `update_job` | `test_closed_job_cannot_be_edited` |
| FR-1.6 | `_clean_skills` validator in `schemas/job.py` | `test_create_job_starts_as_draft` |
| FR-1.7 | `list_jobs` filters plus `Page[T]` | `test_list_filters_by_status_and_skill`, `test_pagination_reports_total_beyond_the_page` |
| FR-1.8 | `ON DELETE CASCADE` on `applications.job_id` | `test_deleting_a_job_cascades_to_its_applications` |
| FR-2.1 | `unique=True` on `candidates.email` | `test_duplicate_email_is_rejected` |
| FR-2.2 | `normalise_email` validator | `test_register_candidate` |
| FR-2.4 | `email` absent from `CandidateUpdate` | `test_email_cannot_be_changed_by_patch` |
| FR-3.2 | `uq_applications_job_candidate` unique constraint | `test_second_application_to_the_same_job_is_rejected`, `test_the_database_itself_refuses_a_duplicate` |
| FR-3.3 | Status guard in `apply_to_job` | `test_draft_job_does_not_accept_applications`, `test_closed_job_does_not_accept_applications` |
| FR-3.4 | `_check_eligibility` experience check | `test_insufficient_experience_is_not_eligible` |
| FR-3.5 | `_check_eligibility` skill overlap | `test_no_overlapping_skills_is_not_eligible`, `test_one_overlapping_skill_is_enough` |
| FR-3.6 | `_count_active_applications` vs settings | `test_candidate_hits_the_active_application_limit`, `test_rejected_applications_free_up_a_slot` |
| FR-3.7 | `job.max_applications` check | `test_job_capacity_is_enforced` |
| FR-3.8 | `ALLOWED_TRANSITIONS` map | `test_legal_stage_progression`, `test_cannot_skip_straight_to_hired` |
| FR-3.9 | Empty transition sets for terminal stages | `test_terminal_stage_cannot_be_left` |
| FR-4.1 | `routers/health.py` | `test_liveness_returns_ok` |
| FR-4.2 | `register_exception_handlers` | `test_validation_error_uses_the_same_envelope` |
| FR-4.3 | `RequestContextMiddleware` | `test_unknown_job_returns_structured_404` |
| NFR-4 | `pagination_params` ceiling | `test_limit_above_the_ceiling_is_rejected` |
