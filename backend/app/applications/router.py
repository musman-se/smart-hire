"""Application endpoints.

Applying is nested under the job (POST /jobs/{job_id}/applications) because an
application cannot exist without one — the URL says so. Reading and advancing use the
flat /applications path, because by then the application has its own identity.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import JSONResponse

from app.applications import service as application_service
from app.applications.enums import ApplicationStage
from app.applications.processor import ApplicationProcessorDep, start_processing
from app.applications.schemas import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationStageUpdate,
    StageChangeRead,
)
from app.core.db import SessionDep
from app.core.idempotency import IdempotencyDep, IdempotencyKey
from app.core.pagination import Page, PaginationDep
from app.core.schemas import ErrorResponse
from app.notifications import service as notification_service
from app.notifications.schemas import NotificationRead

# Nested under a job.
job_applications_router = APIRouter()

# Flat, for applications addressed by their own id.
router = APIRouter()


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
        application = await application_service.apply_to_job(session, job_id, payload)
        # Committed: the application is safe. Scoring and the confirmation message run
        # in the background; if the workflow engine is down they wait for a retry via
        # POST /applications/{id}/process — the candidate's 201 does not.
        await start_processing(processor, application.id)
        return ApplicationRead.model_validate(application)

    return await idempotency.run(
        key=idempotency_key,
        request=request,
        body=payload,
        status_code=status.HTTP_201_CREATED,
        operation=apply,
    )


@job_applications_router.get(
    "/{job_id}/applications",
    response_model=Page[ApplicationRead],
    summary="List applications for a job",
)
async def list_job_applications(
    session: SessionDep,
    pagination: PaginationDep,
    job_id: uuid.UUID,
    stage: Annotated[ApplicationStage | None, Query()] = None,
) -> Page[ApplicationRead]:
    applications, total = await application_service.list_applications(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        job_id=job_id,
        stage=stage,
    )
    return Page[ApplicationRead].of(applications, total, pagination)


@router.get("", response_model=Page[ApplicationRead], summary="List applications")
async def list_applications(
    session: SessionDep,
    pagination: PaginationDep,
    job_id: Annotated[uuid.UUID | None, Query()] = None,
    candidate_id: Annotated[uuid.UUID | None, Query()] = None,
    stage: Annotated[ApplicationStage | None, Query()] = None,
) -> Page[ApplicationRead]:
    applications, total = await application_service.list_applications(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        job_id=job_id,
        candidate_id=candidate_id,
        stage=stage,
    )
    return Page[ApplicationRead].of(applications, total, pagination)


@router.get("/{application_id}", response_model=ApplicationRead, summary="Get one application")
async def get_application(session: SessionDep, application_id: uuid.UUID) -> ApplicationRead:
    application = await application_service.get_application(session, application_id)
    return ApplicationRead.model_validate(application)


@router.post(
    "/{application_id}/stage",
    response_model=ApplicationRead,
    summary="Advance an application",
    responses={409: {"model": ErrorResponse, "description": "Illegal stage transition"}},
)
async def advance_stage(
    session: SessionDep, application_id: uuid.UUID, payload: ApplicationStageUpdate
) -> ApplicationRead:
    application = await application_service.advance_stage(
        session, application_id, payload.stage, payload.note
    )
    return ApplicationRead.model_validate(application)


@router.get(
    "/{application_id}/history",
    response_model=list[StageChangeRead],
    summary="An application's stage history, oldest first",
)
async def get_history(session: SessionDep, application_id: uuid.UUID) -> list[StageChangeRead]:
    changes = await application_service.get_history(session, application_id)
    return [StageChangeRead.model_validate(change) for change in changes]


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
    session: SessionDep, application_id: uuid.UUID
) -> list[NotificationRead]:
    await application_service.get_application(session, application_id)
    notifications = await notification_service.list_for_application(session, application_id)
    return [NotificationRead.model_validate(n) for n in notifications]


@router.delete(
    "/{application_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Withdraw an application",
    description=(
        "Moves the application to the terminal `withdrawn` stage. Nothing is deleted: "
        "the application and its history remain readable."
    ),
)
async def withdraw_application(session: SessionDep, application_id: uuid.UUID) -> None:
    await application_service.withdraw_application(session, application_id)
