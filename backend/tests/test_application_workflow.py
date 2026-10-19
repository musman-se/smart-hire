"""ProcessApplication on a real Temporal server, with the production worker."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from temporalio.client import Client, WorkflowFailureError

from app.applications.workflow import ProcessApplicationInput, ProcessApplicationWorkflow
from app.worker import build_worker
from tests.factories import apply, make_candidate, make_job
from tests.fakes import InlineApplicationProcessor


@pytest.fixture
def no_inline_processing(processor: InlineApplicationProcessor) -> None:
    """Let the application be created without the inline processor scoring it, so the
    real workflow is the first to do the work."""

    async def accept_only(application_id: uuid.UUID) -> None:
        processor.starts.append(application_id)

    processor.start = accept_only  # type: ignore[method-assign]


async def _run(temporal: Client, engine, application_id: str):
    task_queue = f"test-applications-{uuid.uuid4()}"
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with build_worker(temporal, task_queue, sessions):
        return await temporal.execute_workflow(
            ProcessApplicationWorkflow.run,
            ProcessApplicationInput(application_id=application_id, max_attempts=3),
            id=f"test-process-application-{application_id}-{uuid.uuid4()}",
            task_queue=task_queue,
        )


@pytest.mark.usefixtures("no_inline_processing")
async def test_workflow_scores_and_confirms_exactly_once(
    client: AsyncClient, engine, temporal: Client
) -> None:
    job = await make_job(client, min_experience_years=0)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    first = await _run(temporal, engine, application["id"])
    second = await _run(temporal, engine, application["id"])

    assert first.match_score == second.match_score == 100.0
    assert (first.notified, second.notified) == (True, False)  # one email, not two
    notifications = (await client.get(f"/applications/{application['id']}/notifications")).json()
    assert len(notifications) == 1


async def test_a_missing_application_fails_without_retrying(engine, temporal: Client) -> None:
    with pytest.raises(WorkflowFailureError):
        await _run(temporal, engine, str(uuid.uuid4()))
