"""Starting and inspecting publishing workflows — the API's side of Temporal.

Services depend on the JobPublisher protocol, not on Temporal directly. Production uses
TemporalJobPublisher; the API tests swap in a publisher that runs the same activities
inline, so they stay fast and need no Temporal server. The workflow itself is tested
against a real server in tests/test_publishing_workflow.py.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated, Protocol

from fastapi import Depends
from temporalio.client import Client, WorkflowQueryFailedError, WorkflowQueryRejectedError
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.service import RPCError, RPCStatusCode

from app.core.config import settings
from app.core.temporal import WorkflowUnavailableError, get_temporal_client
from app.publishing.workflow import PublishJobInput, PublishJobWorkflow

logger = logging.getLogger(__name__)


# Every call to Temporal gets a deadline. Without one, a slow (rather than down) server
# would hold the request — and its pooled database connection — indefinitely.
RPC_TIMEOUT = timedelta(seconds=5)


def workflow_id_for(job_id: uuid.UUID) -> str:
    """One workflow id per job. Temporal allows only one *running* workflow per id, so a
    job can never have two publishing runs racing each other."""
    return f"publish-job-{job_id}"


@dataclass
class WorkflowRun:
    workflow_id: str
    run_id: str
    status: str
    current_step: str | None
    started_at: datetime | None
    closed_at: datetime | None


class JobPublisher(Protocol):
    async def start(self, job_id: uuid.UUID) -> None:
        """Start a publishing run for this job, replacing any run still in flight."""

    async def describe(self, job_id: uuid.UUID) -> WorkflowRun | None:
        """The latest run for this job, or None if there has never been one."""


class TemporalJobPublisher:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def start(self, job_id: uuid.UUID) -> None:
        try:
            await self._client.start_workflow(
                PublishJobWorkflow.run,
                PublishJobInput(job_id=str(job_id), max_attempts=settings.publishing_max_attempts),
                id=workflow_id_for(job_id),
                task_queue=settings.temporal_task_queue,
                # A run already in flight is replaced: the newest request wins. Attaching
                # to it instead (USE_EXISTING) could let an old run — started for text
                # since edited, or before a close and reopen — publish stale content.
                # A replaced run's work is not lost, only redone: every step reads the
                # job fresh and is idempotent.
                id_conflict_policy=WorkflowIDConflictPolicy.TERMINATE_EXISTING,
                # Finished before: a new run may reuse the id — a job is republished
                # after every reopen, and its content refreshed after every edit.
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
                # Deliberately no execution timeout. A run waiting for a worker should
                # wait — that is the durability the workflow exists for. A timeout would
                # end it with no compensation, stranding the job in PROCESSING. The
                # activities have their own timeouts; they bound the actual work.
                rpc_timeout=RPC_TIMEOUT,
            )
        except (RPCError, RuntimeError) as exc:
            # RuntimeError is what the lazy client raises when it cannot connect at all.
            logger.warning("publish_start_failed job=%s error=%s", job_id, exc)
            raise WorkflowUnavailableError() from exc
        logger.info("publish_started job=%s", job_id)

    async def describe(self, job_id: uuid.UUID) -> WorkflowRun | None:
        handle = self._client.get_workflow_handle(workflow_id_for(job_id))
        try:
            description = await handle.describe(rpc_timeout=RPC_TIMEOUT)
        except RPCError as exc:
            if exc.status == RPCStatusCode.NOT_FOUND:
                return None
            raise WorkflowUnavailableError() from exc
        except RuntimeError as exc:
            raise WorkflowUnavailableError() from exc

        status = description.status.name.lower() if description.status else "unknown"
        step = None
        if status == "running":
            try:
                step = await handle.query(PublishJobWorkflow.current_step, rpc_timeout=RPC_TIMEOUT)
            except (RPCError, WorkflowQueryFailedError, WorkflowQueryRejectedError):
                # No worker polling right now, or the query was refused: the run itself
                # is fine, there is just no live step to show.
                step = None
        return WorkflowRun(
            workflow_id=description.id,
            run_id=description.run_id,
            status=status,
            current_step=step,
            started_at=description.start_time,
            closed_at=description.close_time,
        )


async def get_job_publisher() -> JobPublisher:
    return TemporalJobPublisher(await get_temporal_client())


JobPublisherDep = Annotated[JobPublisher, Depends(get_job_publisher)]
