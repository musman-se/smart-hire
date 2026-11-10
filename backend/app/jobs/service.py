"""Job business logic.

Routers translate HTTP; this module decides what is allowed. Publishing is not here:
since Module 2 it is a workflow, owned by app/publishing.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import contains_pattern
from app.jobs.enums import JobStatus
from app.jobs.errors import JobNotFoundError, JobNotOpenError
from app.jobs.models import Job
from app.jobs.schemas import JobCreate, JobUpdate
from app.skills.models import Skill
from app.skills.service import resolve_skills


async def get_job(session: AsyncSession, job_id: uuid.UUID, *, lock: bool = False) -> Job:
    """Load a job. lock=True takes a row lock (SELECT ... FOR NO KEY UPDATE) held until
    the transaction ends — for callers that read the job, decide, then write based on
    what they read. See applications.service.apply_to_job.

    A locked load also overwrites any copy already in the session (populate_existing).
    Without it, session.get takes the lock but hands back the object an earlier,
    unlocked read put in the identity map — so the caller decides on what the row was
    *before* the lock, and the lock protects nothing.
    """
    job = await session.get(
        Job,
        job_id,
        with_for_update={"key_share": True} if lock else None,
        populate_existing=lock,
    )
    if job is None:
        raise JobNotFoundError(job_id)
    return job


async def has_applied(session: AsyncSession, job_id: uuid.UUID, candidate_id: uuid.UUID) -> bool:
    """Whether this candidate has an application to this job. Through Job.applications,
    by keyword, so the jobs package needs no import from applications."""
    return bool(
        await session.scalar(
            select(Job.id).where(Job.id == job_id, Job.applications.any(candidate_id=candidate_id))
        )
    )


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
        filters.append(Job.title.ilike(contains_pattern(search.strip()), escape="\\"))

    # Counted with the same filters but without limit/offset, so `total` describes the
    # whole result set rather than the page.
    total = await session.scalar(select(func.count()).select_from(Job).where(*filters)) or 0

    rows = await session.scalars(
        select(Job)
        .where(*filters)
        # id breaks ties: rows created in one transaction share created_at, and without
        # a total order a row could appear on two pages, or on none.
        .order_by(Job.created_at.desc(), Job.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total


async def count_by_status(session: AsyncSession) -> dict[JobStatus, int]:
    """How many jobs are in each status — every status, zero included. One GROUP BY,
    where the console used to send one count request per status."""
    counts = dict.fromkeys(JobStatus, 0)
    rows = await session.execute(select(Job.status, func.count()).group_by(Job.status))
    for status, count in rows.tuples():
        counts[status] = count
    return counts


async def create_job(session: AsyncSession, payload: JobCreate) -> Job:
    # Status is not taken from the payload: every job begins as a draft.
    job = Job(**payload.model_dump(exclude={"required_skills"}), status=JobStatus.DRAFT)
    job.skill_set = await resolve_skills(session, payload.required_skills)
    session.add(job)
    await session.commit()
    return job


def _content(job: Job) -> tuple[str, str, list[str]]:
    """What the publishing workflow analyses: a change here means the job's extracted
    content is out of date."""
    return job.title, job.description, sorted(job.required_skills)


async def update_job(
    session: AsyncSession, job_id: uuid.UUID, payload: JobUpdate
) -> tuple[Job, bool]:
    """The updated job, and whether its analysed content actually changed — a form that
    sends every field on every save must not restart the analysis for nothing.
    """
    # Locked, like every other read-decide-write on a job: without it, a publish or a
    # close committed between this read and the write below would not stop the edit.
    job = await get_job(session, job_id, lock=True)

    if job.status is JobStatus.CLOSED:
        raise JobNotOpenError("A closed job cannot be edited. Reopen it first.")
    if job.status is JobStatus.PROCESSING:
        # The workflow is reading this text right now; an edit would race it, and the
        # result would describe neither the old text nor the new.
        raise JobNotOpenError("This job is being published. Edit it once publishing ends.")

    # exclude_unset is what makes this a PATCH: a field the client did not send is left
    # alone, rather than being overwritten with the schema default.
    before = _content(job)
    changes = payload.model_dump(exclude_unset=True)
    if "required_skills" in changes:
        skills = changes.pop("required_skills") or []
        if sorted(skills) != sorted(job.required_skills):
            job.skill_set = await resolve_skills(session, skills)
            # Skills live in job_skills, so changing only them would issue no UPDATE on
            # jobs and updated_at would not move. Set from the database's clock, like
            # every other updated_at — the console compares it with Temporal's times.
            job.updated_at = func.now()
    for field, value in changes.items():
        setattr(job, field, value)

    content_changed = _content(job) != before
    await session.commit()
    return job, content_changed


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
