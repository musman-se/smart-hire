"""Job business logic.

Routers translate HTTP; this module decides what is allowed. Keeping the two apart means
the publishing rules below are reusable from the Temporal workflow that replaces the
direct transition in a later module.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import JobStatus
from app.core.errors import JobNotOpenError, NotFoundError
from app.models.job import Job
from app.schemas.job import JobCreate, JobUpdate


async def get_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    job = await session.get(Job, job_id)
    if job is None:
        raise NotFoundError(f"Job {job_id} does not exist.")
    return job


async def list_jobs(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    status: JobStatus | None = None,
    skill: str | None = None,
    search: str | None = None,
) -> tuple[list[Job], int]:
    """Return one page of jobs plus the total matching the same filters."""
    filters = []
    if status is not None:
        filters.append(Job.status == status)
    if skill:
        # Array containment: "required_skills contains this skill". Uses the GIN index.
        filters.append(Job.required_skills.contains([skill.strip().lower()]))
    if search:
        filters.append(Job.title.ilike(f"%{search.strip()}%"))

    # Counted with the same filters but without limit/offset, so `total` describes the
    # whole result set rather than the page.
    total = await session.scalar(select(func.count()).select_from(Job).where(*filters)) or 0

    rows = await session.scalars(
        select(Job).where(*filters).order_by(Job.created_at.desc()).limit(limit).offset(offset)
    )
    return list(rows), total


async def create_job(session: AsyncSession, payload: JobCreate) -> Job:
    # Status is not taken from the payload: every job begins as a draft.
    job = Job(**payload.model_dump(), status=JobStatus.DRAFT)
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def update_job(session: AsyncSession, job_id: uuid.UUID, payload: JobUpdate) -> Job:
    job = await get_job(session, job_id)

    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be edited. Reopen it first.")

    # exclude_unset is what makes this a PATCH: a field the client did not send is left
    # alone, rather than being overwritten with the schema default.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, value)

    await session.commit()
    await session.refresh(job)
    return job


async def publish_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    """draft -> published.

    In Module 2 this becomes a Temporal workflow: extract skills, break the description
    into components, index for search, and only then mark the job ready. The state
    machine below is the seam that workflow will slot into.
    """
    job = await get_job(session, job_id)

    if job.status is JobStatus.PUBLISHED:
        return job  # idempotent: publishing twice is not an error
    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be published. Reopen it first.")

    job.status = JobStatus.PUBLISHED
    job.published_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(job)
    return job


async def close_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    job = await get_job(session, job_id)
    job.status = JobStatus.CLOSED
    await session.commit()
    await session.refresh(job)
    return job


async def reopen_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    """closed -> draft. Reopening returns a job to draft, not straight to published,
    so it passes through the publishing checks again."""
    job = await get_job(session, job_id)
    job.status = JobStatus.DRAFT
    job.published_at = None
    await session.commit()
    await session.refresh(job)
    return job


async def delete_job(session: AsyncSession, job_id: uuid.UUID) -> None:
    job = await get_job(session, job_id)
    # Applications cascade — enforced by ON DELETE CASCADE in the database, so it holds
    # even for a delete issued outside this codebase.
    await session.delete(job)
    await session.commit()
