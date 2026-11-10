"""Publishing business logic: when a job may be published, and reading the results."""

import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.core.temporal import WorkflowStartUnknownError, WorkflowUnavailableError
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


async def publish_job(session: AsyncSession, publisher: JobPublisher, job_id: uuid.UUID) -> Job:
    """Move a job into PROCESSING and start the workflow that will make it PUBLISHED.

    Returns at once — the work happens in the worker — so the endpoint answers 202.

    Safe to repeat from every state it accepts:
      draft, publish_failed -> processing, then start the workflow
      processing            -> start a fresh run, replacing any in flight — which also
                               heals a job whose run was lost to an outage
      published             -> re-run the analysis; the job stays published. The way to
                               retry a content refresh that failed (publish_error set)

    The status is committed *before* the workflow starts, so the workflow always finds
    the job in PROCESSING. If the start then fails, the status is put back and nothing
    is left half-done. (Writing to two systems — Postgres, then Temporal — without a
    shared transaction is the "dual write" problem; this compensating revert is the
    simple answer. The outbox pattern, in Module 3, is the general one.)
    """
    job = await get_job(session, job_id, lock=True)

    if job.status is JobStatus.PUBLISHED:
        # Lock released before the network call, as below. Nothing to undo if Temporal
        # is down: the job never left PUBLISHED, and the 503 tells the recruiter the
        # analysis was not re-run — truthfully "nothing was changed", so nothing is
        # recorded either (the analysis it already has may be perfectly current).
        await session.commit()
        await _start_refresh(session, publisher, job, quiet=False)
        return job
    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be published. Reopen it first.")

    previous_status, previous_error = job.status, job.publish_error
    if previous_status in (JobStatus.DRAFT, JobStatus.PUBLISH_FAILED):
        job.status = JobStatus.PROCESSING
        job.publish_error = None
    # Always commit, even with nothing changed: it also releases the row lock. A
    # database lock must never be held across a network call to another system.
    await session.commit()

    try:
        await publisher.start(job.id)
    except WorkflowStartUnknownError:
        # The run may be going: leave the job in PROCESSING. If it was not started, the
        # job shows as stuck and "restart publishing" (this same call) starts it.
        raise
    except WorkflowUnavailableError:
        if previous_status is not JobStatus.PROCESSING:
            # Undo only our own change, and only if it still stands: conditional on the
            # job still being PROCESSING. A recruiter who closed the job in the meantime
            # keeps their close. The previous failure reason comes back too — the 503
            # says nothing was changed, so nothing should be.
            await session.execute(
                update(Job)
                .where(Job.id == job.id, Job.status == JobStatus.PROCESSING)
                .values(status=previous_status, publish_error=previous_error)
                .execution_options(synchronize_session=False)
            )
            await session.commit()
        raise

    return job


async def refresh_content(session: AsyncSession, publisher: JobPublisher, job: Job) -> None:
    """Re-analyse a published job after its text changed. Best effort.

    The job stays PUBLISHED throughout — a typo fix must not take a live job offline —
    and the edit has already been saved, so a refresh that cannot start does not fail
    the request: it is recorded in publish_error, as a failed refresh is. The recruiter
    sees the analysis is stale, and publishing the job again re-runs it.
    """
    await _start_refresh(session, publisher, job, quiet=True)


REFRESH_NOT_STARTED = (
    "The analysis was not refreshed: the workflow engine was unavailable. "
    "Publish the job again to refresh it."
)


async def _start_refresh(
    session: AsyncSession, publisher: JobPublisher, job: Job, *, quiet: bool
) -> None:
    """Start a refresh run for a published job.

    quiet: an edit, already saved, whose re-analysis could not start — recorded in
    publish_error, since the analysis now describes the old text, and not raised.
    Otherwise (an explicit re-run, which answers 503) the outage is raised and nothing
    is written.
    """
    try:
        await publisher.start(job.id, refresh=True)
    except WorkflowStartUnknownError:
        # Possibly running: nothing to record. If it did not start, the analysis stays
        # as it was until the next edit or re-publish.
        logger.warning("content_refresh_unknown job=%s", job.id)
        if not quiet:
            raise
    except WorkflowUnavailableError:
        logger.warning("content_refresh_skipped job=%s reason=workflow_unavailable", job.id)
        if not quiet:
            raise
        # Conditional, as the workflow's own writes are: a job closed meanwhile is left
        # alone.
        recorded = await session.execute(
            update(Job)
            .where(Job.id == job.id, Job.status == JobStatus.PUBLISHED)
            .values(publish_error=REFRESH_NOT_STARTED)
            .execution_options(synchronize_session=False)
        )
        await session.commit()
        if recorded.rowcount:
            # The object in hand too, so the response that follows shows it — set as
            # committed, not as a change for the session to write again.
            set_committed_value(job, "publish_error", REFRESH_NOT_STARTED)


async def get_publication(
    session: AsyncSession, publisher: JobPublisher, job_id: uuid.UUID
) -> PublicationRead:
    job = await get_job(session, job_id)
    # End the read transaction first: the pooled connection goes back to the pool
    # instead of idling through a call to another system.
    await session.commit()
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
