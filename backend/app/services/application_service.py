"""Application business logic — the three rules the brief names explicitly.

    1. Duplicate applications
    2. Job-specific eligibility checks
    3. Application limits

Rule 1 is the interesting one. It is enforced by a unique constraint in the database,
not by a Python check, because a Python check cannot be correct under concurrency: two
simultaneous requests can both SELECT "no existing application", both see nothing, and
both INSERT. The pre-check below exists only to produce a friendly error on the common
path — the constraint is what makes the rule true.
"""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import ApplicationStage, JobStatus
from app.core.errors import (
    ApplicationLimitReachedError,
    DuplicateApplicationError,
    InvalidStageTransitionError,
    JobCapacityReachedError,
    JobNotOpenError,
    NotEligibleError,
    NotFoundError,
)
from app.models.application import Application
from app.models.candidate import Candidate
from app.models.job import Job
from app.schemas.application import ApplicationCreate
from app.services.candidate_service import get_candidate
from app.services.job_service import get_job

logger = logging.getLogger(__name__)

# Which stages may follow which. Encoding this as data rather than a chain of ifs makes
# the hiring pipeline readable at a glance — and reviewable by someone non-technical.
ALLOWED_TRANSITIONS: dict[ApplicationStage, set[ApplicationStage]] = {
    ApplicationStage.APPLIED: {ApplicationStage.SCREENING, ApplicationStage.REJECTED},
    ApplicationStage.SCREENING: {ApplicationStage.INTERVIEW, ApplicationStage.REJECTED},
    ApplicationStage.INTERVIEW: {ApplicationStage.OFFER, ApplicationStage.REJECTED},
    ApplicationStage.OFFER: {ApplicationStage.HIRED, ApplicationStage.REJECTED},
    ApplicationStage.HIRED: set(),
    ApplicationStage.REJECTED: set(),
}


async def get_application(session: AsyncSession, application_id: uuid.UUID) -> Application:
    application = await session.get(Application, application_id)
    if application is None:
        raise NotFoundError(f"Application {application_id} does not exist.")
    return application


def _check_eligibility(job: Job, candidate: Candidate) -> None:
    """Rule 2 — job-specific eligibility.

    Raises on the first failure. Both checks are pure functions of two objects, which is
    why this is a plain function: it is trivially testable without a database.
    """
    if candidate.years_experience < job.min_experience_years:
        raise NotEligibleError(
            f"This role requires {job.min_experience_years} years of experience; "
            f"the candidate has {candidate.years_experience}."
        )

    if job.required_skills:
        overlap = set(job.required_skills) & set(candidate.skills)
        if not overlap:
            raise NotEligibleError(
                "The candidate has none of the required skills: "
                + ", ".join(sorted(job.required_skills))
                + "."
            )


async def _count_active_applications(session: AsyncSession, candidate_id: uuid.UUID) -> int:
    """Applications that still occupy one of the candidate's slots.

    Terminal stages are excluded on purpose: a rejected candidate should not be locked
    out of applying elsewhere.
    """
    return (
        await session.scalar(
            select(func.count())
            .select_from(Application)
            .where(
                Application.candidate_id == candidate_id,
                Application.stage.notin_(list(ApplicationStage.terminal())),
            )
        )
        or 0
    )


async def apply_to_job(
    session: AsyncSession, job_id: uuid.UUID, payload: ApplicationCreate
) -> Application:
    job = await get_job(session, job_id)
    candidate = await get_candidate(session, payload.candidate_id)

    # A draft job is not visible to candidates; a closed one is no longer accepting.
    if job.status is not JobStatus.PUBLISHED:
        raise JobNotOpenError(
            f"Job {job.id} is {job.status} and is not accepting applications."
        )

    _check_eligibility(job, candidate)

    # Rule 3 — application limits, both per candidate and per job.
    active = await _count_active_applications(session, candidate.id)
    if active >= settings.max_applications_per_candidate:
        raise ApplicationLimitReachedError(
            f"The candidate already has {active} active applications; "
            f"the limit is {settings.max_applications_per_candidate}."
        )

    if job.max_applications is not None:
        received = (
            await session.scalar(
                select(func.count())
                .select_from(Application)
                .where(Application.job_id == job.id)
            )
            or 0
        )
        if received >= job.max_applications:
            raise JobCapacityReachedError(
                f"Job {job.id} has reached its cap of {job.max_applications} applications."
            )

    # Rule 1, friendly path: a pre-check so the common case returns a clear 409 without
    # burning a failed transaction. It is not what makes the rule correct.
    existing = await session.scalar(
        select(Application.id).where(
            Application.job_id == job.id,
            Application.candidate_id == candidate.id,
        )
    )
    if existing is not None:
        raise DuplicateApplicationError("This candidate has already applied to this job.")

    application = Application(
        job_id=job.id,
        candidate_id=candidate.id,
        cover_letter=payload.cover_letter,
        stage=ApplicationStage.APPLIED,
    )
    session.add(application)

    try:
        await session.commit()
    except IntegrityError as exc:
        # Rule 1, correct path. Reaching here means another request inserted the same
        # (job_id, candidate_id) between our pre-check and our commit. The unique
        # constraint caught what the pre-check could not.
        await session.rollback()
        logger.info("duplicate_application_race job=%s candidate=%s", job.id, candidate.id)
        raise DuplicateApplicationError(
            "This candidate has already applied to this job."
        ) from exc

    await session.refresh(application)
    logger.info(
        "application_created id=%s job=%s candidate=%s", application.id, job.id, candidate.id
    )
    return application


async def list_applications(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    job_id: uuid.UUID | None = None,
    candidate_id: uuid.UUID | None = None,
    stage: ApplicationStage | None = None,
) -> tuple[list[Application], int]:
    filters = []
    if job_id is not None:
        filters.append(Application.job_id == job_id)
    if candidate_id is not None:
        filters.append(Application.candidate_id == candidate_id)
    if stage is not None:
        filters.append(Application.stage == stage)

    total = await session.scalar(select(func.count()).select_from(Application).where(*filters)) or 0

    rows = await session.scalars(
        select(Application)
        .where(*filters)
        .order_by(Application.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total


async def advance_stage(
    session: AsyncSession, application_id: uuid.UUID, target: ApplicationStage
) -> Application:
    """Move an application through the pipeline, refusing illegal jumps.

    Without this check an application could go straight from APPLIED to HIRED, skipping
    screening and interview — and the analytics in later modules would report a
    conversion funnel that never happened.
    """
    application = await get_application(session, application_id)
    current = application.stage

    if target == current:
        return application  # idempotent

    if target not in ALLOWED_TRANSITIONS[current]:
        allowed = ", ".join(sorted(ALLOWED_TRANSITIONS[current])) or "nothing (terminal stage)"
        raise InvalidStageTransitionError(
            f"Cannot move an application from {current} to {target}. Allowed: {allowed}."
        )

    application.stage = target
    await session.commit()
    await session.refresh(application)
    logger.info("application_stage_changed id=%s from=%s to=%s", application.id, current, target)
    return application


async def withdraw_application(session: AsyncSession, application_id: uuid.UUID) -> None:
    application = await get_application(session, application_id)
    await session.delete(application)
    await session.commit()
