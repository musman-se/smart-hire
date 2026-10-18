"""The publishing pipeline through the API, with the workflow run inline.

What Temporal itself adds — retries, durability, one run per job — is tested against a
real server in test_publishing_workflow.py. These tests cover the rules around it: which
states may publish, what gets stored, and what happens when things fail.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.publishing.activities import StoreContentInput
from app.publishing.models import JobKeyword, JobSection
from tests.factories import apply, make_candidate, make_job
from tests.fakes import InlineJobPublisher

DESCRIPTION = """Build the hiring platform that fast-growing companies run on.

Responsibilities:
- Design FastAPI services backed by PostgreSQL
- Operate the Kafka event pipeline

Requirements:
- 4+ years of Python
- Experience with Docker

What we offer:
- Remote-first team
- Learning budget
"""


async def test_publish_is_accepted_then_completed(client: AsyncClient) -> None:
    job = await make_job(client, publish=False, description=DESCRIPTION)

    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 202
    assert response.json()["status"] == "processing"
    final = (await client.get(f"/jobs/{job['id']}")).json()
    assert final["status"] == "published"
    assert final["content_processed_at"] is not None
    assert final["publish_error"] is None


async def test_published_job_exposes_its_structured_content(client: AsyncClient) -> None:
    job = await make_job(client, description=DESCRIPTION, required_skills=["python"])

    content = (await client.get(f"/jobs/{job['id']}/content")).json()

    assert content["sections"]["summary"] == [
        "Build the hiring platform that fast-growing companies run on."
    ]
    assert content["sections"]["responsibilities"] == [
        "Design FastAPI services backed by PostgreSQL",
        "Operate the Kafka event pipeline",
    ]
    assert content["sections"]["requirements"] == ["4+ years of Python", "Experience with Docker"]
    assert content["sections"]["benefits"] == ["Remote-first team", "Learning budget"]

    skills = {s["name"]: s["mentions"] for s in content["extracted_skills"]}
    assert {"fastapi", "postgresql", "kafka", "python", "docker"} <= skills.keys()
    assert content["keywords"] and content["keywords"][0]["score"] == 1.0


async def test_extracted_skills_join_the_shared_vocabulary(client: AsyncClient) -> None:
    await make_job(client, description=DESCRIPTION, required_skills=["python"])

    vocabulary = (await client.get("/skills", params={"limit": 100})).json()["items"]
    names = [skill["name"] for skill in vocabulary]

    # Only "python" was listed by the recruiter; the rest were found in the text.
    assert {"docker", "fastapi", "kafka", "postgresql"} <= set(names)


async def test_extracted_skills_do_not_change_eligibility(client: AsyncClient) -> None:
    """The text mentions kafka; the recruiter did not require it. A candidate without it
    must still be eligible — mentions are observations, not requirements."""
    job = await make_job(
        client, description=DESCRIPTION, required_skills=["python"], min_experience_years=0
    )
    candidate = await make_candidate(client, skills=["python"])

    assert (await apply(client, job, candidate)).status_code == 201


async def test_storing_content_twice_leaves_one_copy(
    client: AsyncClient, session: AsyncSession, publisher: InlineJobPublisher
) -> None:
    """Activities run at least once, so store_job_content must be idempotent."""
    job = await make_job(client, description=DESCRIPTION)
    job_id = job["id"]
    acts = publisher.activities
    analysis = await acts.extract_skills_and_keywords(job_id)
    breakdown = await acts.break_down_description(job_id)

    async def counts() -> tuple[int, int]:
        jid = uuid.UUID(job_id)
        sections = await session.scalar(
            select(func.count()).select_from(JobSection).where(JobSection.job_id == jid)
        )
        keywords = await session.scalar(
            select(func.count()).select_from(JobKeyword).where(JobKeyword.job_id == jid)
        )
        return sections, keywords

    before = await counts()
    for _ in range(2):
        await acts.store_job_content(StoreContentInput(job_id, analysis, breakdown))

    assert await counts() == before


async def test_a_failed_publish_is_recorded_and_can_be_retried(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    job = await make_job(client, publish=False)

    monkeypatch.setattr(settings, "publishing_fault_rate", 1.0)  # every attempt fails
    await client.post(f"/jobs/{job['id']}/publish")
    failed = (await client.get(f"/jobs/{job['id']}")).json()

    assert failed["status"] == "publish_failed"
    assert "Injected fault" in failed["publish_error"]

    monkeypatch.setattr(settings, "publishing_fault_rate", 0.0)
    await client.post(f"/jobs/{job['id']}/publish")
    retried = (await client.get(f"/jobs/{job['id']}")).json()

    assert retried["status"] == "published"
    assert retried["publish_error"] is None


async def test_engine_outage_changes_nothing(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    """If the workflow cannot be started, the job must not be left in PROCESSING with
    nothing processing it."""
    job = await make_job(client, publish=False)
    publisher.available = False

    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "workflow_unavailable"
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "draft"


async def test_closed_job_cannot_be_published(client: AsyncClient) -> None:
    job = await make_job(client)
    await client.post(f"/jobs/{job['id']}/close")

    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "job_not_open"


async def test_job_being_processed_cannot_be_edited_or_applied_to(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client, publish=False, min_experience_years=0)
    candidate = await make_candidate(client)

    # Leave the job in PROCESSING: a publisher that accepts the start and does nothing,
    # as if the worker had not picked the task up yet.
    async def accept_only(job_id: uuid.UUID, *, restart: bool = False) -> None:
        publisher.starts.append((job_id, restart))

    publisher.start = accept_only  # type: ignore[method-assign]
    await client.post(f"/jobs/{job['id']}/publish")

    edit = await client.patch(f"/jobs/{job['id']}", json={"title": "Renamed mid-publish"})
    application = await apply(client, job, candidate)

    assert edit.status_code == 409
    assert application.status_code == 409
    assert application.json()["error"]["code"] == "job_not_open"


async def test_publishing_a_processing_job_starts_again_rather_than_twice(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    """A second Publish on a job still processing re-issues the start, which Temporal
    attaches to the run in flight (USE_EXISTING) — or restarts if it was lost."""
    job = await make_job(client, publish=False)

    async def accept_only(job_id: uuid.UUID, *, restart: bool = False) -> None:
        publisher.starts.append((job_id, restart))

    publisher.start = accept_only  # type: ignore[method-assign]
    first = await client.post(f"/jobs/{job['id']}/publish")
    second = await client.post(f"/jobs/{job['id']}/publish")

    assert first.status_code == second.status_code == 202
    assert [restart for _, restart in publisher.starts] == [False, False]


async def test_editing_a_published_job_refreshes_its_content(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client, description="Write Python services. You will own them.")

    response = await client.patch(
        f"/jobs/{job['id']}", json={"description": "Write Rust services. You will own them."}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "published"  # stayed live throughout
    assert publisher.starts[-1][1] is True  # restart=True: the newest edit wins
    content = (await client.get(f"/jobs/{job['id']}/content")).json()
    assert "rust" in [s["name"] for s in content["extracted_skills"]]


async def test_editing_a_field_outside_the_content_does_not_refresh(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client)
    starts_before = len(publisher.starts)

    await client.patch(f"/jobs/{job['id']}", json={"location": "Karachi"})

    assert len(publisher.starts) == starts_before


async def test_closing_mid_publish_is_not_undone_by_the_workflow(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    """mark_job_published only moves a job out of PROCESSING; a job closed meanwhile
    stays closed."""
    job = await make_job(client, publish=False)

    async def accept_only(job_id: uuid.UUID, *, restart: bool = False) -> None:
        publisher.starts.append((job_id, restart))

    publisher.start = accept_only  # type: ignore[method-assign]
    await client.post(f"/jobs/{job['id']}/publish")
    await client.post(f"/jobs/{job['id']}/close")

    changed = await publisher.activities.mark_job_published(job["id"])

    assert changed is False
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "closed"


async def test_publication_status_reports_the_job_state(client: AsyncClient) -> None:
    job = await make_job(client)

    response = await client.get(f"/jobs/{job['id']}/publication")

    assert response.status_code == 200
    body = response.json()
    assert body["job_status"] == "published"
    assert body["content_processed_at"] is not None
