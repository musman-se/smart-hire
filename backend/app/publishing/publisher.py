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
from temporalio.client import Client
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.service import RPCError, RPCStatusCode

from app.core.config import settings
from app.core.temporal import WorkflowUnavailableError, get_temporal_client
from app.publishing.workflow import PublishJobInput, PublishJobWorkflow

logger = logging.getLogger(__name__)


def workflow_id_for(job_id: uuid.UUID) -> str:
    """One workflow id per job. Temporal allows only one *running* workflow per id, which
    is what turns a double-clicked Publish into one run instead of two."""
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
    async def start(self, job_id: uuid.UUID, *, restart: bool = False) -> None:
        """Start publishing. restart=False attaches to a run already in progress;
        restart=True replaces it, so the newest edit is the one processed."""

    async def describe(self, job_id: uuid.UUID) -> WorkflowRun | None:
        """The latest run for this job, or None if there has never been one."""


class TemporalJobPublisher:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def start(self, job_id: uuid.UUID, *, restart: bool = False) -> None:
        try:
            await self._client.start_workflow(
                PublishJobWorkflow.run,
                PublishJobInput(
                    job_id=str(job_id), max_attempts=settings.publishing_max_attempts
                ),
                id=workflow_id_for(job_id),
                task_queue=settings.temporal_task_queue,
                # Already running: attach to it (publish), or replace it (content edit).
                id_conflict_policy=(
                    WorkflowIDConflictPolicy.TERMINATE_EXISTING
                    if restart
                    else WorkflowIDConflictPolicy.USE_EXISTING
                ),
                # Finished before: a new run may reuse the id — a job is republished
                # after every reopen, and its content refreshed after every edit.
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
                execution_timeout=timedelta(minutes=10),
            )
        except (RPCError, RuntimeError) as exc:
            # RuntimeError is what the lazy client raises when it cannot connect at all.
            logger.warning("publish_start_failed job=%s error=%s", job_id, exc)
            raise WorkflowUnavailableError() from exc
        logger.info("publish_started job=%s restart=%s", job_id, restart)

    async def describe(self, job_id: uuid.UUID) -> WorkflowRun | None:
        handle = self._client.get_workflow_handle(workflow_id_for(job_id))
        try:
            description = await handle.describe()
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
                step = await handle.query(PublishJobWorkflow.current_step)
            except RPCError:
                step = None  # no worker polling right now; the run itself is fine
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
