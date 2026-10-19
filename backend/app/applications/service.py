"""Application business logic — the three rules the brief names explicitly.

    1. Duplicate applications
    2. Job-specific eligibility checks
    3. Application limits

Each rule is made to hold under concurrency, which is where the naive versions break:

- Rule 1 is enforced by a unique constraint, not by a Python check. Two simultaneous
  requests can both SELECT "no existing application", both see nothing, and both
  INSERT. The pre-check below only produces a friendly error on the common path.
- Rule 3 counts rows and then inserts one — the same check-then-act shape, which a
  constraint cannot express ("at most N rows" is not a unique key). It is made safe with
  row locks instead: see apply_to_job.
"""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.applications.enums import ApplicationStage
from app.applications.errors import (
    ApplicationLimitReachedError,
    ApplicationNotFoundError,
    DuplicateApplicationError,
    InvalidStageTransitionError,
    JobCapacityReachedError,
    NotEligibleError,
)
from app.applications.models import Application, ApplicationStageChange
from app.applications.schemas import ApplicationCreate
from app.candidates.models import Candidate
from app.candidates.service import get_candidate
from app.core.config import settings
from app.core.errors import DomainError
from app.jobs.enums import JobStatus
from app.jobs.errors import JobNotOpenError
from app.jobs.models import Job
from app.jobs.service import get_job

logger = logging.getLogger(__name__)

# Which stages may follow which. Encoding this as data rather than a chain of ifs makes
# the hiring pipeline readable at a glance — and reviewable by someone non-technical.
#
# REJECTED (the recruiter's decision) and WITHDRAWN (the candidate's) are reachable from
# every active stage; nothing leaves a terminal stage.
_REJECT_OR_WITHDRAW = {ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN}
ALLOWED_TRANSITIONS: dict[ApplicationStage, set[ApplicationStage]] = {
    ApplicationStage.APPLIED: {ApplicationStage.SCREENING} | _REJECT_OR_WITHDRAW,
    ApplicationStage.SCREENING: {ApplicationStage.INTERVIEW} | _REJECT_OR_WITHDRAW,
    ApplicationStage.INTERVIEW: {ApplicationStage.OFFER} | _REJECT_OR_WITHDRAW,
    ApplicationStage.OFFER: {ApplicationStage.HIRED} | _REJECT_OR_WITHDRAW,
    ApplicationStage.HIRED: set(),
    ApplicationStage.REJECTED: set(),
    ApplicationStage.WITHDRAWN: set(),
}


async def get_application(
    session: AsyncSession, application_id: uuid.UUID, *, lock: bool = False
) -> Application:
    application = await session.get(
        Application, application_id, with_for_update={"key_share": True} if lock else None
    )
    if application is None:
        raise ApplicationNotFoundError(application_id)
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


async def _count_job_applications(session: AsyncSession, job_id: uuid.UUID) -> int:
    """Every application a job has received, whatever its stage — the cap is on intake."""
    return (
        await session.scalar(
            select(func.count()).select_from(Application).where(Application.job_id == job_id)
        )
        or 0
    )


async def apply_to_job(
    session: AsyncSession, job_id: uuid.UUID, payload: ApplicationCreate
) -> Application:
    try:
        return await _apply(session, job_id, payload)
    except DomainError:
        # A refusal ends the transaction at once. Otherwise the job and candidate row
        # locks taken below would be held while the caller stores the refusal (the
        # idempotency record, in Redis) and the request winds down — serialising every
        # other application to this job behind a network call.
        await session.rollback()
        raise


async def _apply(
    session: AsyncSession, job_id: uuid.UUID, payload: ApplicationCreate
) -> Application:
    # Lock the job row, then the candidate row, until this transaction commits.
    #
    # Rule 3 counts applications and then inserts one. Without the locks, five requests
    # can all count "0 of 1" before any of them commits, and all five get in. With them,
    # a second application to the same job — or from the same candidate — waits here
    # until the first commits, and then counts the row the first one inserted.
    #
    # The order is fixed — always job, then candidate — because two transactions taking
    # the same two locks in opposite orders can each hold one and wait forever for the
    # other: a deadlock. Postgres would detect it and abort one, but only after a delay.
    #
    # FOR NO KEY UPDATE rather than FOR UPDATE: it still excludes other appliers, but
    # does not block inserts elsewhere that merely reference this row through a foreign
    # key (job_skills, for one).
    #
    # The cost is that applications to one job are serialised. Each holds the lock for
    # a few milliseconds, so a single job can still take hundreds per second; a job
    # without a cap could skip the job lock entirely if that ever matters.
    job = await get_job(session, job_id, lock=True)
    candidate = await get_candidate(session, payload.candidate_id, lock=True)

    # A draft job is not visible to candidates; a closed one is no longer accepting.
    if job.status is not JobStatus.PUBLISHED:
        raise JobNotOpenError(f"Job {job.id} is {job.status} and is not accepting applications.")

    _check_eligibility(job, candidate)

    # Rule 3 — application limits, both per candidate and per job.
    active = await _count_active_applications(session, candidate.id)
    if active >= settings.max_applications_per_candidate:
        raise ApplicationLimitReachedError(
            f"The candidate already has {active} active applications; "
            f"the limit is {settings.max_applications_per_candidate}."
        )

    if job.max_applications is not None:
        received = await _count_job_applications(session, job.id)
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

    # The id is set here rather than left to the INSERT, so the first history entry
    # can reference it in the same transaction.
    application = Application(
        id=uuid.uuid4(),
        job_id=job.id,
        candidate_id=candidate.id,
        cover_letter=payload.cover_letter,
        stage=ApplicationStage.APPLIED,
    )
    session.add(application)
    session.add(
        ApplicationStageChange(
            application_id=application.id, from_stage=None, to_stage=ApplicationStage.APPLIED
        )
    )

    try:
        await session.commit()
    except IntegrityError as exc:
        # Rule 1, correct path. Reaching here means another request inserted the same
        # (job_id, candidate_id) between our pre-check and our commit. The unique
        # constraint caught what the pre-check could not.
        await session.rollback()
        logger.info("duplicate_application_race job=%s candidate=%s", job.id, candidate.id)
        raise DuplicateApplicationError("This candidate has already applied to this job.") from exc

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
    session: AsyncSession,
    application_id: uuid.UUID,
    target: ApplicationStage,
    note: str | None = None,
) -> Application:
    """Move an application through the pipeline, refusing illegal jumps.

    Without this check an application could go straight from APPLIED to HIRED, skipping
    screening and interview — and the analytics in later modules would report a
    conversion funnel that never happened.
    """
    # Locked so two recruiters moving the same application at once are applied one
    # after the other. Unlocked, both read "applied", both write, and the second
    # silently overwrites the first — a lost update.
    application = await get_application(session, application_id, lock=True)
    current = application.stage

    if target == current:
        return application  # idempotent

    if target not in ALLOWED_TRANSITIONS[current]:
        allowed = ", ".join(sorted(ALLOWED_TRANSITIONS[current])) or "nothing (terminal stage)"
        raise InvalidStageTransitionError(
            f"Cannot move an application from {current} to {target}. Allowed: {allowed}."
        )

    application.stage = target
    session.add(
        ApplicationStageChange(
            application_id=application.id, from_stage=current, to_stage=target, note=note
        )
    )
    await session.commit()
    logger.info("application_stage_changed id=%s from=%s to=%s", application.id, current, target)
    return application


async def withdraw_application(session: AsyncSession, application_id: uuid.UUID) -> Application:
    """The candidate pulls out. A stage change, not a delete: the application and its
    history stay, its slot under the candidate's limit is freed, and it cannot be
    withdrawn once hired or rejected. Withdrawing twice is a no-op.

    The (job, candidate) pair stays taken, so a withdrawn application cannot be
    re-submitted to the same job — withdrawal is final for that job.
    """
    return await advance_stage(
        session, application_id, ApplicationStage.WITHDRAWN, note="Withdrawn by the candidate"
    )


async def get_history(
    session: AsyncSession, application_id: uuid.UUID
) -> list[ApplicationStageChange]:
    application = await get_application(session, application_id)
    rows = await session.scalars(
        select(ApplicationStageChange)
        .where(ApplicationStageChange.application_id == application.id)
        .order_by(ApplicationStageChange.changed_at, ApplicationStageChange.id)
    )
    return list(rows)
