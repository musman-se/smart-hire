"""Starting application processing — the API's side of the ProcessApplication workflow."""

import logging
import uuid
from datetime import timedelta
from typing import Annotated, Protocol

from fastapi import Depends
from temporalio.client import Client
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.service import RPCError

from app.applications.workflow import ProcessApplicationInput, ProcessApplicationWorkflow
from app.core.config import settings
from app.core.temporal import WorkflowUnavailableError, get_temporal_client

logger = logging.getLogger(__name__)


def workflow_id_for(application_id: uuid.UUID) -> str:
    return f"process-application-{application_id}"


class ApplicationProcessor(Protocol):
    async def start(self, application_id: uuid.UUID) -> None:
        """Start scoring and notification; attach to a run already in progress."""


class TemporalApplicationProcessor:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def start(self, application_id: uuid.UUID) -> None:
        try:
            await self._client.start_workflow(
                ProcessApplicationWorkflow.run,
                ProcessApplicationInput(
                    application_id=str(application_id),
                    max_attempts=settings.application_processing_max_attempts,
                ),
                id=workflow_id_for(application_id),
                task_queue=settings.temporal_task_queue,
                # Unlike publishing, attaching is right here: both steps read the
                # application fresh and nothing about it can go stale mid-run.
                id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
                # No execution timeout: a run waits out a worker outage. See publisher.py.
                rpc_timeout=timedelta(seconds=5),
            )
        except (RPCError, RuntimeError) as exc:
            logger.warning("process_start_failed application=%s error=%s", application_id, exc)
            raise WorkflowUnavailableError() from exc


async def start_processing(processor: ApplicationProcessor, application_id: uuid.UUID) -> bool:
    """Best effort, for the apply endpoint: the application is already committed, so an
    outage here must not turn a successful application into an error. Returns whether
    processing started."""
    try:
        await processor.start(application_id)
    except WorkflowUnavailableError:
        logger.warning("application_left_unprocessed id=%s", application_id)
        return False
    return True


async def get_application_processor() -> ApplicationProcessor:
    return TemporalApplicationProcessor(await get_temporal_client())


ApplicationProcessorDep = Annotated[ApplicationProcessor, Depends(get_application_processor)]
