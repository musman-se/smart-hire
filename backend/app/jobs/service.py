"""Job business logic.

Routers translate HTTP; this module decides what is allowed. Publishing is not here:
since Module 2 it is a workflow, owned by app/publishing.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.enums import JobStatus
from app.jobs.errors import JobNotFoundError, JobNotOpenError
from app.jobs.models import Job
from app.jobs.schemas import JobCreate, JobUpdate
from app.skills.models import Skill
from app.skills.service import resolve_skills


async def get_job(session: AsyncSession, job_id: uuid.UUID, *, lock: bool = False) -> Job:
    """Load a job. lock=True takes a row lock (SELECT ... FOR NO KEY UPDATE) held until
    the transaction ends — for callers that read the job, decide, then write based on
    what they read. See applications.service.apply_to_job."""
    job = await session.get(Job, job_id, with_for_update={"key_share": True} if lock else None)
    if job is None:
        raise JobNotFoundError(job_id)
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
        # EXISTS (SELECT 1 FROM job_skills JOIN skills ... WHERE skills.name = :skill).
        # Served by the unique index on skills.name and the job_skills primary key.
        filters.append(Job.skill_set.any(Skill.name == skill.strip().lower()))
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
    job = Job(**payload.model_dump(exclude={"required_skills"}), status=JobStatus.DRAFT)
    job.skill_set = await resolve_skills(session, payload.required_skills)
    session.add(job)
    await session.commit()
    return job


async def update_job(session: AsyncSession, job_id: uuid.UUID, payload: JobUpdate) -> Job:
    job = await get_job(session, job_id)

    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be edited. Reopen it first.")
    if job.status is JobStatus.PROCESSING:
        # The workflow is reading this text right now; an edit would race it, and the
        # result would describe neither the old text nor the new.
        raise JobNotOpenError("This job is being published. Edit it once publishing ends.")

    # exclude_unset is what makes this a PATCH: a field the client did not send is left
    # alone, rather than being overwritten with the schema default.
    changes = payload.model_dump(exclude_unset=True)
    if "required_skills" in changes:
        job.skill_set = await resolve_skills(session, changes.pop("required_skills") or [])
    for field, value in changes.items():
        setattr(job, field, value)

    await session.commit()
    return job


async def close_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    """-> closed, from any state. Closing mid-publish is allowed: the workflow's final
    step only moves a job out of PROCESSING, so it leaves a closed job closed."""
    job = await get_job(session, job_id, lock=True)
    job.status = JobStatus.CLOSED
    await session.commit()
    return job


async def reopen_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    """closed -> draft. Reopening returns a job to draft, not straight to published,
    so it passes through the publishing checks again."""
    job = await get_job(session, job_id, lock=True)
    if job.status is not JobStatus.CLOSED:
        raise JobNotOpenError(f"Only a closed job can be reopened; this one is {job.status}.")
    job.status = JobStatus.DRAFT
    job.published_at = None
    await session.commit()
    return job


async def delete_job(session: AsyncSession, job_id: uuid.UUID) -> None:
    job = await get_job(session, job_id)
    # Applications cascade — enforced by ON DELETE CASCADE in the database, so it holds
    # even for a delete issued outside this codebase.
    await session.delete(job)
    await session.commit()
