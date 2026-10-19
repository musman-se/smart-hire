"""Publishing business logic: when a job may be published, and reading the results."""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.temporal import WorkflowUnavailableError
from app.jobs.enums import JobStatus
from app.jobs.errors import JobNotOpenError
from app.jobs.models import Job
from app.jobs.service import get_job
from app.publishing.enums import SectionKind
from app.publishing.models import JobKeyword, JobSection, job_extracted_skills
from app.publishing.publisher import JobPublisher
from app.publishing.schemas import (
    ExtractedSkillRead,
    JobContentRead,
    JobSectionsRead,
    KeywordRead,
    PublicationRead,
    WorkflowRunRead,
)
from app.skills.models import Skill

logger = logging.getLogger(__name__)

# Editing any of these on a published job re-runs the analysis.
CONTENT_FIELDS = frozenset({"title", "description", "required_skills"})


async def publish_job(session: AsyncSession, publisher: JobPublisher, job_id: uuid.UUID) -> Job:
    """Move a job into PROCESSING and start the workflow that will make it PUBLISHED.

    Returns at once — the work happens in the worker — so the endpoint answers 202.

    Idempotent from every state it accepts:
      draft, publish_failed -> processing, then start the workflow
      processing            -> start again: attaches to the run in flight (USE_EXISTING),
                               or restarts one lost to an outage, healing a stuck job
      published             -> nothing to do

    The status is committed *before* the workflow starts, so the workflow always finds
    the job in PROCESSING. If the start then fails, the status is put back and nothing
    is left half-done. (Writing to two systems — Postgres, then Temporal — without a
    shared transaction is the "dual write" problem; this compensating revert is the
    simple answer. The outbox pattern, in Module 3, is the general one.)
    """
    job = await get_job(session, job_id, lock=True)

    if job.status is JobStatus.PUBLISHED:
        return job
    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be published. Reopen it first.")

    previous = job.status
    if previous in (JobStatus.DRAFT, JobStatus.PUBLISH_FAILED):
        job.status = JobStatus.PROCESSING
        job.publish_error = None
    # Always commit, even with nothing changed: it also releases the row lock. A
    # database lock must never be held across a network call to another system.
    await session.commit()

    try:
        await publisher.start(job.id)
    except WorkflowUnavailableError:
        if previous is not JobStatus.PROCESSING:
            job.status = previous
            await session.commit()
        raise

    return job


async def refresh_content(publisher: JobPublisher, job: Job) -> None:
    """Re-analyse a published job after its text changed. Best effort.

    The job stays PUBLISHED throughout — a typo fix must not take a live job offline —
    and the edit has already been saved. If Temporal is down the content is stale until
    the next edit, which content_processed_at < updated_at makes visible.
    """
    try:
        await publisher.start(job.id, restart=True)
    except WorkflowUnavailableError:
        logger.warning("content_refresh_skipped job=%s reason=workflow_unavailable", job.id)


async def get_publication(
    session: AsyncSession, publisher: JobPublisher, job_id: uuid.UUID
) -> PublicationRead:
    job = await get_job(session, job_id)
    try:
        run = await publisher.describe(job.id)
    except WorkflowUnavailableError:
        run = None  # the job's own state is still worth returning
    return PublicationRead(
        job_id=job.id,
        job_status=job.status,
        publish_error=job.publish_error,
        content_processed_at=job.content_processed_at,
        workflow=WorkflowRunRead.model_validate(run, from_attributes=True) if run else None,
    )


async def get_content(session: AsyncSession, job_id: uuid.UUID) -> JobContentRead:
    job = await get_job(session, job_id)

    sections: dict[SectionKind, list[str]] = {kind: [] for kind in SectionKind}
    rows = await session.scalars(
        select(JobSection)
        .where(JobSection.job_id == job.id)
        .order_by(JobSection.kind, JobSection.position)
    )
    for row in rows:
        sections[row.kind].append(row.content)

    keywords = await session.scalars(
        select(JobKeyword)
        .where(JobKeyword.job_id == job.id)
        .order_by(JobKeyword.score.desc(), JobKeyword.keyword)
    )
    skills = await session.execute(
        select(Skill.name, job_extracted_skills.c.mentions)
        .join(job_extracted_skills, job_extracted_skills.c.skill_id == Skill.id)
        .where(job_extracted_skills.c.job_id == job.id)
        .order_by(job_extracted_skills.c.mentions.desc(), Skill.name)
    )

    return JobContentRead(
        job_id=job.id,
        processed_at=job.content_processed_at,
        sections=JobSectionsRead(
            summary=sections[SectionKind.SUMMARY],
            responsibilities=sections[SectionKind.RESPONSIBILITY],
            requirements=sections[SectionKind.REQUIREMENT],
            benefits=sections[SectionKind.BENEFIT],
        ),
        keywords=[KeywordRead(keyword=k.keyword, score=k.score) for k in keywords],
        extracted_skills=[
            ExtractedSkillRead(name=name, mentions=mentions) for name, mentions in skills
        ],
    )
