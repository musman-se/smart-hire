"""Test doubles for the systems the API talks to besides Postgres."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.publishing.activities import MarkFailedInput, PublishingActivities, StoreContentInput
from app.publishing.errors import WorkflowUnavailableError
from app.publishing.publisher import WorkflowRun


class InlineJobPublisher:
    """Stands in for TemporalJobPublisher in the API tests.

    It runs the real activities, against the test database, in the workflow's order —
    so a published job in these tests has exactly the content a real run produces — but
    synchronously, inside the request, with no Temporal server. What it does not
    reproduce is Temporal's behaviour itself (retries, durability, one run per id); that
    is tested against a real server in test_publishing_workflow.py.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self.activities = PublishingActivities(session_factory)
        self.available = True
        self.starts: list[tuple[uuid.UUID, bool]] = []

    async def start(self, job_id: uuid.UUID, *, restart: bool = False) -> None:
        if not self.available:
            raise WorkflowUnavailableError()
        self.starts.append((job_id, restart))

        job = str(job_id)
        try:
            analysis = await self.activities.extract_skills_and_keywords(job)
            breakdown = await self.activities.break_down_description(job)
            await self.activities.store_job_content(
                StoreContentInput(job_id=job, analysis=analysis, breakdown=breakdown)
            )
            await self.activities.mark_job_published(job)
        except Exception as exc:  # noqa: BLE001 - mirrors the workflow's compensation
            await self.activities.mark_job_publish_failed(
                MarkFailedInput(job_id=job, reason=str(exc))
            )

    async def describe(self, job_id: uuid.UUID) -> WorkflowRun | None:
        return None
