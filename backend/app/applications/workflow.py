"""The application processing workflow — scoring and the confirmation message.

    POST /jobs/{id}/applications ── 201 (application + first history row, one transaction)
                                  └─ start ProcessApplication ──┬─ score_application
                                                                └─ send_application_received

The application itself is never part of the workflow: it is recorded synchronously, in
the request, and is safe the moment the 201 is sent. Everything here is follow-up work
that may lag, retry or fail without touching it. If the workflow cannot start at all,
the application still stands, unscored; POST /applications/{id}/process starts it again.

Deterministic, like every workflow: no I/O here, only orchestration.
"""

import asyncio
from dataclasses import dataclass
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.applications.activities import APPLICATION_NOT_FOUND, ApplicationActivities
    from app.core.temporal import NON_RETRYABLE_DATABASE_ERRORS, PROGRAMMING_ERRORS


# How long one step may keep retrying, all attempts together, before the run gives up.
# Long enough to outlast a database restart or an evening's outage; short enough that a
# failure no retry can fix ends, and re-processing can start a fresh run.
PROCESSING_STEP_DEADLINE = timedelta(hours=6)


@dataclass
class ProcessApplicationInput:
    application_id: str
    max_attempts: int = 0  # 0 = no limit


@dataclass
class ProcessApplicationResult:
    application_id: str
    match_score: float
    notified: bool  # False if the message had already been sent by an earlier run


@workflow.defn(name="ProcessApplication")
class ProcessApplicationWorkflow:
    @workflow.run
    async def run(self, data: ProcessApplicationInput) -> ProcessApplicationResult:
        # Both steps are idempotent and nobody waits on them, so they keep retrying —
        # backing off to once a minute — until the database answers. With a fixed
        # number of attempts, a database restart of twenty seconds failed every
        # application in flight for good: no score, no confirmation, and nothing
        # recording which ones. What stops them: a deleted application, or a database
        # error no retry can fix (the run fails, and POST /applications/{id}/process
        # starts a fresh one once the cause is fixed).
        options = {
            "start_to_close_timeout": timedelta(seconds=30),
            "retry_policy": RetryPolicy(
                initial_interval=timedelta(seconds=1),
                backoff_coefficient=2.0,
                maximum_interval=timedelta(seconds=60),
                maximum_attempts=data.max_attempts,  # 0 by default: no limit
                non_retryable_error_types=[
                    APPLICATION_NOT_FOUND,
                    "IntegrityError",  # a constraint refusing the row: no retry changes that
                    *NON_RETRYABLE_DATABASE_ERRORS,
                    *PROGRAMMING_ERRORS,
                ],
            ),
            # The backstop for whatever the list above misses: after six hours of
            # retrying, the step fails and the run ends, so POST /applications/{id}/process
            # can start a fresh one instead of attaching to a run that never stops.
            "schedule_to_close_timeout": PROCESSING_STEP_DEADLINE,
        }
        # Independent of each other, so in parallel. return_exceptions: a failed score
        # must not cancel the candidate's confirmation, nor the reverse — each branch
        # finishes, and a failure is raised only once both have settled.
        score, notified = await asyncio.gather(
            workflow.execute_activity_method(
                ApplicationActivities.score_application, data.application_id, **options
            ),
            workflow.execute_activity_method(
                ApplicationActivities.send_application_received, data.application_id, **options
            ),
            return_exceptions=True,
        )
        for outcome in (score, notified):
            if isinstance(outcome, BaseException):
                raise outcome
        return ProcessApplicationResult(
            application_id=data.application_id, match_score=score, notified=notified
        )
