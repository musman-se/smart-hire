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


@dataclass
class ProcessApplicationInput:
    application_id: str
    max_attempts: int = 5


@dataclass
class ProcessApplicationResult:
    application_id: str
    match_score: float
    notified: bool  # False if the message had already been sent by an earlier run


@workflow.defn(name="ProcessApplication")
class ProcessApplicationWorkflow:
    @workflow.run
    async def run(self, data: ProcessApplicationInput) -> ProcessApplicationResult:
        options = {
            "start_to_close_timeout": timedelta(seconds=30),
            "retry_policy": RetryPolicy(
                initial_interval=timedelta(seconds=1),
                backoff_coefficient=2.0,
                maximum_interval=timedelta(seconds=20),
                maximum_attempts=data.max_attempts,
                non_retryable_error_types=[APPLICATION_NOT_FOUND],
            ),
        }
        # Independent of each other, so in parallel. A failed score does not hold back
        # the candidate's confirmation, and the reverse.
        score, notified = await asyncio.gather(
            workflow.execute_activity_method(
                ApplicationActivities.score_application, data.application_id, **options
            ),
            workflow.execute_activity_method(
                ApplicationActivities.send_application_received, data.application_id, **options
            ),
        )
        return ProcessApplicationResult(
            application_id=data.application_id, match_score=score, notified=notified
        )
