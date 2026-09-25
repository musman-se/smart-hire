"""Job endpoints.

Routers stay thin: parse the request, call a service, shape the response. Every decision
about what is allowed lives in app.services.job_service.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import PaginationDep
from app.core.db import SessionDep
from app.core.enums import JobStatus
from app.schemas.common import Page
from app.schemas.job import JobCreate, JobRead, JobUpdate
from app.services import job_service

router = APIRouter()


@router.get("", response_model=Page[JobRead], summary="List jobs")
async def list_jobs(
    session: SessionDep,
    pagination: PaginationDep,
    status_filter: Annotated[JobStatus | None, Query(alias="status")] = None,
    skill: Annotated[str | None, Query(description="Match one required skill")] = None,
    search: Annotated[str | None, Query(description="Case-insensitive title match")] = None,
) -> Page[JobRead]:
    jobs, total = await job_service.list_jobs(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        status=status_filter,
        skill=skill,
        search=search,
    )
    return Page[JobRead](
        items=[JobRead.model_validate(job) for job in jobs],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post(
    "", response_model=JobRead, status_code=status.HTTP_201_CREATED, summary="Create a job"
)
async def create_job(session: SessionDep, payload: JobCreate) -> JobRead:
    job = await job_service.create_job(session, payload)
    return JobRead.model_validate(job)


@router.get("/{job_id}", response_model=JobRead, summary="Get one job")
async def get_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.get_job(session, job_id)
    return JobRead.model_validate(job)


@router.patch("/{job_id}", response_model=JobRead, summary="Update a job")
async def update_job(session: SessionDep, job_id: uuid.UUID, payload: JobUpdate) -> JobRead:
    job = await job_service.update_job(session, job_id, payload)
    return JobRead.model_validate(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a job")
async def delete_job(session: SessionDep, job_id: uuid.UUID) -> None:
    await job_service.delete_job(session, job_id)


# --- Lifecycle transitions -------------------------------------------------------
# Modelled as named actions rather than PATCH status="published". A transition has rules
# and side effects; a field edit implies neither.


@router.post("/{job_id}/publish", response_model=JobRead, summary="Publish a job")
async def publish_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.publish_job(session, job_id)
    return JobRead.model_validate(job)


@router.post("/{job_id}/close", response_model=JobRead, summary="Close a job")
async def close_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.close_job(session, job_id)
    return JobRead.model_validate(job)


@router.post("/{job_id}/reopen", response_model=JobRead, summary="Reopen a closed job")
async def reopen_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.reopen_job(session, job_id)
    return JobRead.model_validate(job)
