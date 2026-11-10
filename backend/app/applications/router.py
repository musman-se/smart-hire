"""Application endpoints.

Applying is nested under the job (POST /jobs/{job_id}/applications) because an
application cannot exist without one — the URL says so. Reading and advancing use the
flat /applications path, because by then the application has its own identity.

Who may do what follows the people involved. A candidate applies, reads and withdraws
their own applications. A recruiter reads every application, moves it through the
pipeline and re-runs its processing — and cannot apply or withdraw on anyone's behalf.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.applications import service as application_service
from app.applications.enums import ApplicationStage
from app.applications.errors import ApplicationNotFoundError
from app.applications.models import Application
from app.applications.processor import ApplicationProcessorDep, start_processing
from app.applications.schemas import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationStageUpdate,
    StageChangeRead,
)
from app.auth.dependencies import CandidateDep, CurrentUserDep, require_recruiter
from app.auth.enums import Role
from app.auth.models import User
from app.core.db import SessionDep
from app.core.errors import ForbiddenError
from app.core.idempotency import IdempotencyDep, IdempotencyKey
from app.core.pagination import Page, PaginationDep
from app.core.schemas import ErrorResponse
from app.jobs.service import get_job
from app.notifications import service as notification_service
from app.notifications.schemas import NotificationRead

# Nested under a job.
job_applications_router = APIRouter()

# Flat, for applications addressed by their own id.
router = APIRouter()

recruiter_only = [Depends(require_recruiter)]


def _as_seen_by(user: User, application: Application) -> ApplicationRead:
    """The match score ranks candidates against one another for the recruiter. It is
    not shown to the candidate being ranked."""
    read = ApplicationRead.model_validate(application)
    if user.role is Role.CANDIDATE:
        return read.model_copy(update={"match_score": None})
    return read


async def _get_visible(session: AsyncSession, user: User, application_id: uuid.UUID) -> Application:
    """The application, if this user may see it. A candidate asking for someone else's
    gets the same 404 as for one that does not exist — see candidates.router._check_own."""
    application = await application_service.get_application(session, application_id)
    if user.role is Role.CANDIDATE and application.candidate_id != user.id:
        raise ApplicationNotFoundError(application_id)
    return application


@job_applications_router.post(
    "/{job_id}/applications",
    response_model=ApplicationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to a job",
    responses={
        409: {
            "model": ErrorResponse,
            "description": "Duplicate application, limit reached, or job not open",
        },
        422: {"model": ErrorResponse, "description": "Candidate is not eligible for this job"},
    },
)
async def apply_to_job(
    session: SessionDep,
    candidate: CandidateDep,
    idempotency: IdempotencyDep,
    processor: ApplicationProcessorDep,
    request: Request,
    job_id: uuid.UUID,
    payload: ApplicationCreate,
    idempotency_key: IdempotencyKey = None,
) -> JSONResponse:
    # Duplicate prevention alone would answer a retried submission with 409 "already
    # applied". With an Idempotency-Key, the retry gets the original 201.
    async def apply() -> ApplicationRead:
        application = await application_service.apply_to_job(session, job_id, candidate.id, payload)
        # Committed: the application is safe. Scoring and the confirmation message run
        # in the background; if the workflow engine is down they wait for a retry via
        # POST /applications/{id}/process — the candidate's 201 does not.
        await start_processing(processor, application.id)
        return _as_seen_by(candidate, application)

    return await idempotency.run(
        key=idempotency_key,
        # Scoped to the candidate: two people who happen to send the same key are two
        # different actions, and one must never be answered with the other's response.
        owner=candidate.id,
        request=request,
        body=payload,
        status_code=status.HTTP_201_CREATED,
        operation=apply,
    )


@job_applications_router.get(
    "/{job_id}/applications",
    response_model=Page[ApplicationRead],
    summary="List applications for a job",
    dependencies=recruiter_only,
)
async def list_job_applications(
    session: SessionDep,
    pagination: PaginationDep,
    job_id: uuid.UUID,
    stage: Annotated[ApplicationStage | None, Query()] = None,
) -> Page[ApplicationRead]:
    # 404 for a job that does not exist, as every other /jobs/{job_id} route answers —
    # not an empty page that looks like a job nobody applied to.
    await get_job(session, job_id)
    applications, total = await application_service.list_applications(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        job_id=job_id,
        stage=stage,
    )
    return Page[ApplicationRead].of(applications, total, pagination)


@router.get(
    "",
    response_model=Page[ApplicationRead],
    summary="List applications",
    description="A candidate always gets their own; `candidate_id` may only name themselves.",
)
async def list_applications(
    session: SessionDep,
    user: CurrentUserDep,
    pagination: PaginationDep,
    job_id: Annotated[uuid.UUID | None, Query()] = None,
    candidate_id: Annotated[uuid.UUID | None, Query()] = None,
    stage: Annotated[ApplicationStage | None, Query()] = None,
) -> Page[ApplicationRead]:
    if user.role is Role.CANDIDATE:
        if candidate_id not in (None, user.id):
            raise ForbiddenError("A candidate can list only their own applications.")
        candidate_id = user.id

    applications, total = await application_service.list_applications(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        job_id=job_id,
        candidate_id=candidate_id,
        stage=stage,
    )
    items = [_as_seen_by(user, application) for application in applications]
    return Page[ApplicationRead].of(items, total, pagination)


@router.get(
    "/stage-counts",
    response_model=dict[ApplicationStage, int],
    summary="Count applications by stage",
    description=(
        "Recruiters only. Every stage, zero included — across all jobs, or for one "
        "`job_id`. One request, for funnels and tab badges."
    ),
    dependencies=recruiter_only,
)
async def count_applications_by_stage(
    session: SessionDep, job_id: Annotated[uuid.UUID | None, Query()] = None
) -> dict[ApplicationStage, int]:
    return await application_service.count_by_stage(session, job_id=job_id)


@router.get(
    "/job-counts",
    response_model=dict[uuid.UUID, int],
    summary="Count applications per job",
    description=(
        "Recruiters only. Every application each listed job has received, whatever its "
        "stage — what a job's cap is measured against. Repeat `job_id` for each job."
    ),
    dependencies=recruiter_only,
)
async def count_applications_by_job(
    session: SessionDep,
    job_id: Annotated[list[uuid.UUID], Query(min_length=1, max_length=100)],
) -> dict[uuid.UUID, int]:
    return await application_service.count_by_job(session, list(dict.fromkeys(job_id)))


@router.get("/{application_id}", response_model=ApplicationRead, summary="Get one application")
async def get_application(
    session: SessionDep, user: CurrentUserDep, application_id: uuid.UUID
) -> ApplicationRead:
    application = await _get_visible(session, user, application_id)
    return _as_seen_by(user, application)


@router.post(
    "/{application_id}/stage",
    response_model=ApplicationRead,
    summary="Advance an application",
    responses={409: {"model": ErrorResponse, "description": "Illegal stage transition"}},
    dependencies=recruiter_only,
)
async def advance_stage(
    session: SessionDep, application_id: uuid.UUID, payload: ApplicationStageUpdate
) -> ApplicationRead:
    if payload.stage is ApplicationStage.WITHDRAWN:
        # Withdrawing is the candidate's decision (DELETE /applications/{id}); the
        # recruiter's way to end an application is to reject it.
        raise ForbiddenError("Only the candidate can withdraw an application. Reject it instead.")
    application = await application_service.advance_stage(
        session, application_id, payload.stage, payload.note
    )
    return ApplicationRead.model_validate(application)


@router.get(
    "/{application_id}/history",
    response_model=list[StageChangeRead],
    summary="An application's stage history, oldest first",
)
async def get_history(
    session: SessionDep, user: CurrentUserDep, application_id: uuid.UUID
) -> list[StageChangeRead]:
    await _get_visible(session, user, application_id)
    changes = await application_service.get_history(session, application_id)
    history = [StageChangeRead.model_validate(change) for change in changes]
    if user.role is Role.CANDIDATE:
        # Notes are the recruiter's reasons ("salary expectations too high"), written
        # for colleagues. The candidate sees every move and its date, not the why.
        history = [change.model_copy(update={"note": None}) for change in history]
    return history


@router.post(
    "/{application_id}/process",
    response_model=ApplicationRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="(Re)run scoring and the confirmation message",
    description=(
        "Starts the ProcessApplication workflow, or attaches to a run in progress. Safe to "
        "repeat: scoring is recomputed, and the confirmation is never sent twice. Use it "
        "to recover an application created while the workflow engine was down."
    ),
    responses={503: {"model": ErrorResponse, "description": "The workflow engine is unreachable"}},
    dependencies=recruiter_only,
)
async def process_application(
    session: SessionDep, processor: ApplicationProcessorDep, application_id: uuid.UUID
) -> ApplicationRead:
    application = await application_service.get_application(session, application_id)
    # End the read transaction before calling Temporal: no pooled connection should
    # idle through a call to another system.
    await session.commit()
    await processor.start(application.id)
    return ApplicationRead.model_validate(application)


@router.get(
    "/{application_id}/notifications",
    response_model=list[NotificationRead],
    summary="Messages sent about an application",
)
async def list_notifications(
    session: SessionDep, user: CurrentUserDep, application_id: uuid.UUID
) -> list[NotificationRead]:
    await _get_visible(session, user, application_id)
    notifications = await notification_service.list_for_application(session, application_id)
    return [NotificationRead.model_validate(n) for n in notifications]


@router.delete(
    "/{application_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Withdraw your application",
    description=(
        "Moves the application to the terminal `withdrawn` stage. Nothing is deleted: "
        "the application and its history remain readable."
    ),
)
async def withdraw_application(
    session: SessionDep, candidate: CandidateDep, application_id: uuid.UUID
) -> None:
    await _get_visible(session, candidate, application_id)
    await application_service.withdraw_application(session, application_id)
