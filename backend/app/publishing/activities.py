"""Publishing activities — the steps of the publishing workflow that touch the world.

In Temporal, a *workflow* decides what happens and in what order; an *activity* does one
piece of real work — here, a database read or write. The split matters because the two
have opposite rules:

- Workflow code is replayed from its recorded history after a crash, so it must be
  deterministic: no I/O, no clock, no randomness. See workflow.py.
- Activity code may do anything, but Temporal guarantees only that it runs *at least*
  once: a worker can finish the work and crash before reporting it, and the activity
  runs again. So every activity here is **idempotent** — running it twice leaves the
  same result as running it once:

    extract_skills_and_keywords   read-only
    break_down_description        read-only
    store_job_content             replaces the job's rows wholesale, in one transaction
    mark_job_published            conditional update: only from PROCESSING
    mark_job_publish_failed       conditional update: only from PROCESSING

The activities are methods on a class holding a session factory, so the worker binds
them to the real database and the tests bind them to the test database.
"""

import logging
import random
import uuid
from dataclasses import dataclass, field

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.core.config import settings
from app.jobs.enums import JobStatus
from app.jobs.models import Job
from app.publishing.content import (
    KNOWN_SKILLS,
    DescriptionBreakdown,
    Keyword,
    break_down_description,
    extract_keywords,
    find_skills,
)
from app.publishing.models import JobKeyword, JobSection, job_extracted_skills
from app.skills.models import Skill
from app.skills.service import resolve_skills

logger = logging.getLogger(__name__)

# Raised as a non-retryable failure: retrying cannot make a deleted job reappear.
JOB_NOT_FOUND = "JobNotFound"


@dataclass
class SkillsAndKeywords:
    skills: dict[str, int] = field(default_factory=dict)
    keywords: list[Keyword] = field(default_factory=list)


@dataclass
class StoreContentInput:
    job_id: str
    analysis: SkillsAndKeywords
    breakdown: DescriptionBreakdown


@dataclass
class MarkFailedInput:
    job_id: str
    reason: str


def _inject_fault(step: str) -> None:
    """Fail on purpose, PUBLISHING_FAULT_RATE of the time, to demonstrate retries.

    Zero by default. Set it to 0.5 and watch the Temporal UI: attempts fail, back off,
    and retry, and the job still ends up published — the failure never reaches the
    recruiter unless every attempt fails.
    """
    rate = settings.publishing_fault_rate
    if rate and random.random() < rate:
        raise RuntimeError(f"Injected fault in {step} (PUBLISHING_FAULT_RATE={rate})")


class PublishingActivities:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = session_factory

    async def _load_job(self, session: AsyncSession, job_id: str) -> Job:
        job = await session.get(Job, uuid.UUID(job_id))
        if job is None:
            raise ApplicationError(
                f"Job {job_id} does not exist.", type=JOB_NOT_FOUND, non_retryable=True
            )
        return job

    @activity.defn(name="extract_skills_and_keywords")
    async def extract_skills_and_keywords(self, job_id: str) -> SkillsAndKeywords:
        """Brief step 1: extract skills and keywords from the description."""
        _inject_fault("extract_skills_and_keywords")
        async with self._sessions() as session:
            job = await self._load_job(session, job_id)
            known = set(await session.scalars(select(Skill.name)))
            text = f"{job.title}\n{job.description}"
            # The recruiter's own required skills count as vocabulary too, so a niche
            # skill they listed is found in the text even on a fresh installation.
            vocabulary = known | KNOWN_SKILLS | set(job.required_skills)
            return SkillsAndKeywords(
                skills=find_skills(text, vocabulary),
                keywords=extract_keywords(job.title, job.description),
            )

    @activity.defn(name="break_down_description")
    async def break_down_description(self, job_id: str) -> DescriptionBreakdown:
        """Brief step 2: break the description into its components."""
        async with self._sessions() as session:
            job = await self._load_job(session, job_id)
            return break_down_description(job.description)

    @activity.defn(name="store_job_content")
    async def store_job_content(self, data: StoreContentInput) -> None:
        """Brief step 3: store the structured data — all of it, or none of it.

        One transaction: delete the job's previous content, insert the new. If anything
        fails midway the transaction rolls back and the old content is untouched, so a
        partial failure cannot leave half of one run and half of another.
        """
        _inject_fault("store_job_content")
        job_id = uuid.UUID(data.job_id)
        async with self._sessions() as session:
            await self._load_job(session, data.job_id)

            await session.execute(delete(JobSection).where(JobSection.job_id == job_id))
            await session.execute(delete(JobKeyword).where(JobKeyword.job_id == job_id))
            await session.execute(
                delete(job_extracted_skills).where(job_extracted_skills.c.job_id == job_id)
            )

            session.add_all(
                JobSection(job_id=job_id, kind=kind, position=position, content=content)
                for kind, items in data.breakdown.items()
                for position, content in enumerate(items)
            )
            session.add_all(
                JobKeyword(job_id=job_id, keyword=k.keyword, score=k.score)
                for k in data.analysis.keywords
            )
            skills = await resolve_skills(session, data.analysis.skills)
            if skills:
                await session.execute(
                    insert(job_extracted_skills),
                    [
                        {
                            "job_id": job_id,
                            "skill_id": skill.id,
                            "mentions": data.analysis.skills[skill.name],
                        }
                        for skill in skills
                    ],
                )
            await session.execute(
                update(Job).where(Job.id == job_id).values(content_processed_at=func.now())
            )
            await session.commit()

        logger.info(
            "job_content_stored job=%s sections=%d keywords=%d skills=%d",
            data.job_id,
            sum(len(items) for _, items in data.breakdown.items()),
            len(data.analysis.keywords),
            len(data.analysis.skills),
        )

    @activity.defn(name="mark_job_published")
    async def mark_job_published(self, job_id: str) -> bool:
        """Brief step 4: mark the job ready — only after every step above succeeded.

        A conditional update (compare-and-set): it changes the row only if the job is
        still PROCESSING. If a recruiter closed it meanwhile, or this is a content
        refresh of an already-published job, nothing changes and False comes back.
        Running it twice is therefore harmless — the second run finds PUBLISHED.
        """
        async with self._sessions() as session:
            result = await session.execute(
                update(Job)
                .where(Job.id == uuid.UUID(job_id), Job.status == JobStatus.PROCESSING)
                .values(
                    status=JobStatus.PUBLISHED,
                    published_at=func.coalesce(Job.published_at, func.now()),
                    publish_error=None,
                )
                .returning(Job.id)
            )
            published = result.scalar_one_or_none() is not None
            await session.commit()
        logger.info("job_mark_published job=%s changed=%s", job_id, published)
        return published

    @activity.defn(name="mark_job_publish_failed")
    async def mark_job_publish_failed(self, data: MarkFailedInput) -> bool:
        """Compensation: record why publishing failed and make the job retryable."""
        async with self._sessions() as session:
            result = await session.execute(
                update(Job)
                .where(Job.id == uuid.UUID(data.job_id), Job.status == JobStatus.PROCESSING)
                .values(status=JobStatus.PUBLISH_FAILED, publish_error=data.reason[:1000])
                .returning(Job.id)
            )
            changed = result.scalar_one_or_none() is not None
            await session.commit()
        logger.warning("job_publish_failed job=%s reason=%s", data.job_id, data.reason)
        return changed

    def all(self) -> list:
        """Every activity, for registering with a worker."""
        return [
            self.extract_skills_and_keywords,
            self.break_down_description,
            self.store_job_content,
            self.mark_job_published,
            self.mark_job_publish_failed,
        ]
