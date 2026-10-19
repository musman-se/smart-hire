"""The job publishing workflow.

    POST /jobs/{id}/publish ── job: draft -> processing ── start PublishJob ──┐
                                                                              ▼
        ┌─ extract_skills_and_keywords ─┐
        │                               ├─ store_job_content ─ mark_job_published
        └─ break_down_description ──────┘        (one transaction)   (processing -> published)

        any step out of retries ──▶ mark_job_publish_failed (processing -> publish_failed)

What Temporal adds over doing these steps in the request handler:

- **Durability.** Every step's result is recorded in the workflow's history on the
  Temporal server. If the worker crashes after storing the content, a new worker
  replays the history, skips what already completed, and carries on from
  mark_job_published. Nothing is re-run that already succeeded; nothing is lost.
- **Retries with backoff**, per activity, configured once below — not hand-written
  try/except loops around every database call.
- **One run per job.** The workflow id is derived from the job id, and Temporal
  refuses to run two workflows with one id at the same time. A double-clicked Publish
  attaches to the run already in progress instead of starting a second.
- **Visibility.** Every run, its input, each attempt and each failure are browsable in
  the Temporal UI (http://localhost:8233), and current_step is queryable live.

This module must stay deterministic: Temporal replays it to rebuild state, and a replay
must make the same decisions in the same order. So: no I/O, no datetime.now(), no
random, no reading settings — anything variable arrives in the workflow input, and all
real work happens in activities.
"""

import asyncio
from dataclasses import dataclass
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError

# Activity modules import SQLAlchemy and the app's settings. The workflow sandbox
# re-imports modules to isolate each run; these are only used for their names and
# dataclasses, so they are passed through rather than re-imported.
with workflow.unsafe.imports_passed_through():
    from app.publishing.activities import (
        JOB_NOT_FOUND,
        MarkFailedInput,
        PublishingActivities,
        StoreContentInput,
    )


@dataclass
class PublishJobInput:
    job_id: str
    # Attempts per activity before the workflow gives up and marks the job failed.
    # Part of the input rather than read from settings inside the workflow: a workflow
    # must not read anything that could differ when it is replayed.
    max_attempts: int = 5


@dataclass
class PublishJobResult:
    job_id: str
    # False when the job was no longer PROCESSING at the end: closed mid-run, or a
    # content refresh of a job that was already published.
    published: bool
    sections: int
    keywords: int
    skills: int


# Exception types that mean "the database refused something". Their messages carry SQL
# and constraint names: useful in the worker log and the Temporal UI, not to a recruiter.
_DATABASE_ERRORS = frozenset(
    {
        "IntegrityError",
        "DataError",
        "ProgrammingError",
        "OperationalError",
        "DBAPIError",
        "InterfaceError",
        "InternalError",
    }
)


def failure_reason(cause: BaseException | None) -> str:
    """What the recruiter is told in publish_error, from the failed activity's cause.
    Plain string work, so deterministic — safe inside a workflow."""
    if isinstance(cause, ApplicationError):
        if cause.type in _DATABASE_ERRORS:
            return (
                "The database refused the extracted content. The details are in the worker "
                "log and the Temporal UI."
            )
        text = f"{cause.type}: {cause.message}" if cause.type else cause.message
    else:
        # A timeout, or a cancellation: the cause's class says which.
        text = type(cause).__name__ if cause else "Unknown failure"
    return text[:500]


@workflow.defn(name="PublishJob")
class PublishJobWorkflow:
    def __init__(self) -> None:
        self._step = "starting"

    @workflow.query
    def current_step(self) -> str:
        """Answered from the workflow's in-memory state, without touching the history."""
        return self._step

    @workflow.run
    async def run(self, data: PublishJobInput) -> PublishJobResult:
        options = {
            # How long one attempt may take before Temporal counts it as failed.
            "start_to_close_timeout": timedelta(seconds=30),
            "retry_policy": RetryPolicy(
                initial_interval=timedelta(seconds=1),
                backoff_coefficient=2.0,  # 1s, 2s, 4s, 8s ...
                maximum_interval=timedelta(seconds=20),
                maximum_attempts=data.max_attempts,
                # Retrying cannot make a deleted job reappear.
                non_retryable_error_types=[JOB_NOT_FOUND],
            ),
        }
        # Compensation must not give up. If marking the job failed could exhaust its
        # retries too, the job would stay PROCESSING with nothing running. It is one
        # conditional UPDATE, so it is retried — with backoff, capped at a minute —
        # until the database answers.
        compensation_options = {
            "start_to_close_timeout": timedelta(seconds=30),
            "retry_policy": RetryPolicy(
                initial_interval=timedelta(seconds=1),
                backoff_coefficient=2.0,
                maximum_interval=timedelta(seconds=60),
                maximum_attempts=0,  # 0 = no limit
            ),
        }
        job_id = data.job_id

        try:
            # Steps 1 and 2 are independent, so they run in parallel.
            self._step = "analysing"
            analysis, breakdown = await asyncio.gather(
                workflow.execute_activity_method(
                    PublishingActivities.extract_skills_and_keywords, job_id, **options
                ),
                workflow.execute_activity_method(
                    PublishingActivities.break_down_description, job_id, **options
                ),
            )

            self._step = "storing"
            await workflow.execute_activity_method(
                PublishingActivities.store_job_content,
                StoreContentInput(job_id=job_id, analysis=analysis, breakdown=breakdown),
                **options,
            )

            # Only now — every earlier step durable — does the job become visible.
            self._step = "marking_ready"
            published = await workflow.execute_activity_method(
                PublishingActivities.mark_job_published, job_id, **options
            )

        except ActivityError as err:
            # An activity exhausted its retries (or failed non-retryably). Compensate:
            # move the job to PUBLISH_FAILED with the reason, so the recruiter can fix
            # and retry, instead of a job stuck in PROCESSING forever.
            self._step = "failed"
            reason = failure_reason(err.cause)
            await workflow.execute_activity_method(
                PublishingActivities.mark_job_publish_failed,
                MarkFailedInput(job_id=job_id, reason=reason),
                **compensation_options,
            )
            # Fail the workflow itself too, so the run shows as Failed in the UI and in
            # the failed-workflows count — not as a success that quietly did nothing.
            raise ApplicationError(
                f"Publishing job {job_id} failed: {reason}", non_retryable=True
            ) from err

        self._step = "completed"
        return PublishJobResult(
            job_id=job_id,
            published=published,
            sections=sum(len(items) for _, items in breakdown.items()),
            keywords=len(analysis.keywords),
            skills=len(analysis.skills),
        )
