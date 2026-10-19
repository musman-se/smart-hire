"""The publishing workflow on a real Temporal server.

The API tests run the activities inline. These run the actual workflow: a real worker
(the one app/worker.py builds), polling a private task queue on the Compose Temporal
server, executing activities against the test database. They prove what only Temporal
provides — orchestration, retries with backoff, and compensation on failure.

They skip when Temporal is unreachable (the `temporal` fixture, in conftest.py).
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker
from temporalio.client import Client, WorkflowFailureError

from app.core.config import settings
from app.jobs.enums import JobStatus
from app.jobs.models import Job
from app.publishing import activities as publishing_activities
from app.publishing.workflow import PublishJobInput, PublishJobWorkflow
from app.worker import build_worker
from tests.factories import make_job


@pytest_asyncio.fixture
async def run_workflow(engine, temporal: Client) -> AsyncGenerator:
    """Runs PublishJob for a job on a fresh worker and a private task queue, so these
    tests never hand work to — or take work from — the Compose worker."""
    task_queue = f"test-publishing-{uuid.uuid4()}"
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def run(job_id: str, *, max_attempts: int = 5):
        async with build_worker(temporal, task_queue, sessions):
            return await temporal.execute_workflow(
                PublishJobWorkflow.run,
                PublishJobInput(job_id=job_id, max_attempts=max_attempts),
                id=f"test-publish-job-{job_id}-{uuid.uuid4()}",
                task_queue=task_queue,
            )

    yield run


async def _processing_job(client: AsyncClient, engine, **overrides) -> dict:
    """A draft job moved to PROCESSING, as POST /publish would leave it."""
    job = await make_job(client, publish=False, **overrides)
    async with engine.begin() as conn:
        await conn.execute(
            update(Job).where(Job.id == uuid.UUID(job["id"])).values(status=JobStatus.PROCESSING)
        )
    return job


async def test_workflow_publishes_the_job_with_its_content(
    client: AsyncClient, engine, run_workflow
) -> None:
    job = await _processing_job(
        client,
        engine,
        description="Responsibilities:\n- Run Kafka in production\n\nRequirements:\n- Python",
    )

    result = await run_workflow(job["id"])

    assert result.published is True
    assert result.sections == 2
    published = (await client.get(f"/jobs/{job['id']}")).json()
    assert published["status"] == "published"
    content = (await client.get(f"/jobs/{job['id']}/content")).json()
    assert content["sections"]["responsibilities"] == ["Run Kafka in production"]


async def test_transient_failures_are_retried_until_they_succeed(
    client: AsyncClient, engine, run_workflow, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The first two attempts at each faulty step fail; Temporal backs off, retries,
    and the job is published anyway. The recruiter never sees the failures."""
    failures: dict[str, int] = {}

    def flaky(step: str) -> None:
        failures[step] = failures.get(step, 0) + 1
        if failures[step] <= 2:
            raise RuntimeError(f"transient failure #{failures[step]} in {step}")

    monkeypatch.setattr(publishing_activities, "_inject_fault", flaky)
    job = await _processing_job(client, engine)

    result = await run_workflow(job["id"], max_attempts=5)

    assert result.published is True
    assert failures == {"extract_skills_and_keywords": 3, "store_job_content": 3}
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "published"


async def test_exhausted_retries_mark_the_job_failed(
    client: AsyncClient, engine, run_workflow, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Every attempt fails. After max_attempts the workflow compensates — the job moves
    to publish_failed with the reason — and the run itself is recorded as Failed."""
    monkeypatch.setattr(settings, "publishing_fault_rate", 1.0)
    job = await _processing_job(client, engine)

    with pytest.raises(WorkflowFailureError):
        await run_workflow(job["id"], max_attempts=2)

    failed = (await client.get(f"/jobs/{job['id']}")).json()
    assert failed["status"] == "publish_failed"
    assert "Injected fault" in failed["publish_error"]


async def test_a_deleted_job_fails_fast_without_retrying(
    client: AsyncClient, engine, run_workflow
) -> None:
    """JobNotFound is non-retryable: five attempts at reading a deleted row would only
    waste time. The workflow fails on the first."""
    missing = str(uuid.uuid4())

    started = asyncio.get_running_loop().time()
    with pytest.raises(WorkflowFailureError):
        await run_workflow(missing, max_attempts=5)

    # With retries the backoff alone would be 1 + 2 + 4 + 8 = 15 seconds.
    assert asyncio.get_running_loop().time() - started < 10
