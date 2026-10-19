# SmartHire — Product Requirements Document

**Module 1: Foundation + Core Services · Module 2: Application Workflow + Publishing Pipeline**
Author: Muhammad Usman · Version 2.0 · 18 October 2026

Sections 1–9 are the Module 1 requirements, as reviewed. Module 2 is
[§10](#10-module-2--application-workflow--publishing-pipeline); where it changes a Module 1
requirement, the Module 1 row is marked *superseded* and points there.

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
| UC-2 | Publish a job | Recruiter | *Superseded by UC-14:* publishing is now an asynchronous workflow |
| UC-3 | Close and reopen a job | Recruiter | Closed jobs reject edits and applications; reopening returns to draft |
| UC-4 | Search jobs | Candidate | Filter by status, required skill, title substring; paginated with a true total |
| UC-5 | Register as a candidate | Candidate | Profile created; duplicate email rejected with `duplicate_email` |
| UC-6 | Update a profile | Candidate | Unsent fields unchanged; email cannot be changed via PATCH |
| UC-7 | Apply to a job | Candidate | Application created in `applied`, subject to UC-8..UC-10 |
| UC-8 | Prevent duplicate applications | Platform | Second application to the same job returns `duplicate_application`, guaranteed by a unique constraint |
| UC-9 | Enforce eligibility | Platform | Insufficient experience or no overlapping skill returns `not_eligible` |
| UC-10 | Enforce application limits | Platform | Candidate limit and per-job cap both enforced; terminal stages free a slot |
| UC-11 | Advance an application | Recruiter | Legal transitions succeed; skipping a stage returns `invalid_stage_transition` |
| UC-12 | Withdraw an application | Candidate | *Superseded by UC-19:* withdrawn applications are kept, not removed |
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
| FR-1.4 | `POST /jobs/{id}/publish` in `app/publishing/router.py` (was `routers/jobs.py`) | `test_publish_sets_status_and_timestamp` |
| FR-1.5 | `JobNotOpenError` guard in `update_job` | `test_closed_job_cannot_be_edited` |
| FR-1.6 | `normalise_skill_names` in `app/skills/schemas.py` | `test_create_job_starts_as_draft` |
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
| FR-4.1 | `app/health.py` | `test_liveness_returns_ok` |
| FR-4.2 | `register_exception_handlers` | `test_validation_error_uses_the_same_envelope` |
| FR-4.3 | `RequestContextMiddleware` | `test_unknown_job_returns_structured_404` |
| NFR-4 | `pagination_params` ceiling | `test_limit_above_the_ceiling_is_rejected` |

---

## 10. Module 2 — Application Workflow + Publishing Pipeline

Delivered 18 October 2026. The brief's Week 2:

> **Candidate application workflow:** duplicate handling, eligibility checks, application
> tracking. **Job publishing workflow (Temporal):** processing → ready lifecycle; job
> content breakdown (skills, requirements, etc.). **Deliverables:** application workflow
> working reliably; publishing workflow orchestrated; job state transitions handled.

Design and failure analysis: [WORKFLOWS.md](WORKFLOWS.md). Decisions:
[ARCHITECTURE.md §4.15–4.21](ARCHITECTURE.md).

### 10.1 Use cases

| ID | Use case | Actor | Acceptance |
|---|---|---|---|
| UC-14 | Publish a job | Recruiter | `202`, job `processing`; becomes `published` only after content is extracted and stored |
| UC-15 | See why publishing failed, and retry | Recruiter | Job `publish_failed` with a reason; publishing again retries |
| UC-16 | Read a job's structured content | Recruiter, Module 4 | Summary, responsibilities, requirements, benefits, keywords, mentioned skills |
| UC-17 | Edit a published job | Recruiter | Content re-analysed in the background; the job stays live |
| UC-18 | Track an application | Candidate, recruiter | Full stage history with timestamps and notes |
| UC-19 | Withdraw an application | Candidate | Stage `withdrawn`; history kept; slot freed; cannot re-apply to that job |
| UC-20 | Be confirmed after applying | Candidate | Exactly one "Application received" message |
| UC-21 | Rank applicants | Recruiter | Each application gets a 0–100 match score |
| UC-22 | Retry a request safely | Any client | Same `Idempotency-Key` → original response, action performed once |
| UC-23 | Observe and recover workflows | Engineer | Every run visible in the Temporal UI; stuck work recoverable by an API call |

### 10.2 Functional requirements

**Publishing**

| ID | Requirement |
|---|---|
| FR-5.1 | Publishing runs as a Temporal workflow, started by `POST /jobs/{id}/publish`, which answers `202` |
| FR-5.2 | The workflow extracts skills and keywords, breaks the description into summary / responsibilities / requirements / benefits, and stores them as structured rows |
| FR-5.3 | The job becomes `published` only after every step has succeeded |
| FR-5.4 | Failed steps are retried with exponential backoff, up to `PUBLISHING_MAX_ATTEMPTS` |
| FR-5.5 | When retries are exhausted the job becomes `publish_failed` with the reason, and can be published again |
| FR-5.6 | A partial failure leaves no partial content: content is replaced in one transaction |
| FR-5.7 | Publishing an already-processing job never runs two workflows for it, and restarts a job whose run was lost |
| FR-5.8 | If the workflow engine is unreachable, publishing changes nothing and answers `503 workflow_unavailable` |
| FR-5.9 | A processing job cannot be edited or applied to; a job closed mid-publish stays closed |
| FR-5.10 | Editing a published job's title, description or required skills re-runs the analysis; the job stays published |
| FR-5.11 | `GET /jobs/{id}/publication` reports job status, workflow status and the live step; `GET /jobs/{id}/content` the extracted content |

**Applications**

| ID | Requirement |
|---|---|
| FR-6.1 | Every stage change is recorded — from, to, note, time — in the same transaction as the change |
| FR-6.2 | Withdrawal is a terminal stage, not a deletion |
| FR-6.3 | After an application is committed, a workflow scores it and sends one confirmation |
| FR-6.4 | The confirmation is sent once, however many times its step runs |
| FR-6.5 | Applying succeeds even if the workflow engine is down; `POST /applications/{id}/process` recovers |
| FR-6.6 | Create endpoints honour `Idempotency-Key`: same key and body → the stored response; same key, different body → `422` |

### 10.3 Non-functional requirements

| ID | Requirement | How it is met |
|---|---|---|
| NFR-11 | **Durability** — work survives a worker crash | Temporal records each completed step; a restarted worker resumes (verified live) |
| NFR-12 | **At-least-once safety** | Every activity idempotent: reads, replace-all transactions, compare-and-set, dedupe keys |
| NFR-13 | **Graceful degradation** | Temporal or Redis down → readiness "degraded" (200), core reads and applications keep working |
| NFR-14 | **Observability of workflows** | Temporal UI, `/publication` with live step, structured worker logs |
| NFR-15 | **Bounded retries** | Exponential backoff with caps; non-retryable errors fail fast |
| NFR-16 | **Configurability** | Attempts, fault injection, addresses and queues all environment variables |

### 10.4 Assumptions

1. **Rule-based analysis.** Skills are matched by spelling against a vocabulary; sections
   by headings and cue words. Semantic matching is Module 4's purpose.
2. **The score ranks within a job.** Components with nothing to measure count in full, so
   scores are not comparable across jobs.
3. **Email is simulated.** The notification row is real; delivery is a log line.
4. **Withdrawal is final for that job.** The (job, candidate) pair stays taken.
5. **Analytics are Module 3.** Workflows emit no events yet; the outbox and Kafka come next.
6. **Development topology.** One Temporal dev server (SQLite) and one worker; production
   would run a Temporal cluster on Postgres, or Temporal Cloud, and several workers.

### 10.5 Milestones

| Phase | Scope | Status |
|---|---|---|
| R | Module 1 review feedback: normalisation, indexes, migrations, environment config | Complete — PR #1 |
| 2.1 | Temporal infrastructure; publishing lifecycle and content schema | Complete — PR #2 |
| 2.2 | Content analysis; PublishJob workflow; publication and content endpoints | Complete — PR #2 |
| 2.3 | Stage history and withdrawal; Idempotency-Key on Redis | Complete — PR #3 |
| 2.4 | ProcessApplication: scoring and confirmation | Complete — PR #3 |
| 2.5 | Recruiter console for all of the above | Complete — PR #4 |
| 2.6 | Documentation | Complete — PR #5 |

### 10.6 Traceability

| Requirement | Implementation | Test |
|---|---|---|
| FR-5.1 | `publishing/router.py`, `publishing/service.publish_job`, `TemporalJobPublisher` | `test_publish_is_accepted_then_completed` |
| FR-5.2 | `publishing/content.py`, `PublishingActivities`, `job_sections` / `job_keywords` / `job_extracted_skills` | `test_content_analysis.py`, `test_published_job_exposes_its_structured_content` |
| FR-5.3 | `mark_job_published` is the last activity, compare-and-set | `test_workflow_publishes_the_job_with_its_content` |
| FR-5.4 | `RetryPolicy` in `PublishJobWorkflow` | `test_transient_failures_are_retried_until_they_succeed` |
| FR-5.5 | `except ActivityError` → `mark_job_publish_failed` | `test_exhausted_retries_mark_the_job_failed`, `test_a_failed_publish_is_recorded_and_can_be_retried` |
| FR-5.6 | `store_job_content`: one transaction, replace-all | `test_storing_content_twice_leaves_one_copy` |
| FR-5.7 | Workflow id per job + `TERMINATE_EXISTING`; console *Restart publishing* | `test_publishing_a_processing_job_starts_a_fresh_run` |
| FR-5.8 | Revert in `publish_job`; `WorkflowUnavailableError` | `test_engine_outage_changes_nothing` |
| FR-5.9 | Guard in `update_job`; status check in `apply_to_job`; CAS | `test_job_being_processed_cannot_be_edited_or_applied_to`, `test_closing_mid_publish_is_not_undone_by_the_workflow` |
| FR-5.10 | `jobs/router.update_job` → `refresh_content` (`TERMINATE_EXISTING`) | `test_editing_a_published_job_refreshes_its_content`, `test_editing_a_field_outside_the_content_does_not_refresh` |
| FR-5.11 | `get_publication`, `get_content` | `test_publication_status_reports_the_job_state` |
| FR-6.1 | `ApplicationStageChange`, written in `apply_to_job` / `advance_stage` | `test_every_stage_change_is_recorded_in_order`, `test_a_refused_transition_leaves_no_history` |
| FR-6.2 | `ApplicationStage.WITHDRAWN`, `withdraw_application` | `test_withdrawing_keeps_the_application_and_its_history`, `test_withdrawing_frees_a_slot_but_not_the_same_job` |
| FR-6.3 | `ProcessApplicationWorkflow`, `applications/scoring.py` | `test_applying_scores_the_application_and_confirms_it`, `test_scoring.py` |
| FR-6.4 | `notifications.dedupe_key` + `ON CONFLICT DO NOTHING` | `test_workflow_scores_and_confirms_exactly_once`, `test_the_confirmation_is_sent_once_however_often_the_activity_runs` |
| FR-6.5 | `start_processing` best effort; `POST /applications/{id}/process` | `test_an_engine_outage_does_not_fail_the_application` |
| FR-6.6 | `core/idempotency.py` | `test_idempotency.py` (8 tests) |
| NFR-11 | Temporal history + stateless worker | Live: worker stopped mid-publish, restarted → published |
| NFR-13 | `health.py` readiness | `test_readiness_is_degraded_not_down_without_temporal_or_redis`, `test_readiness_is_503_whatever_the_database_raises`, `test_redis_down_fails_open` |

