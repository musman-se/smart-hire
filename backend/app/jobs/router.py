"""Job endpoints.

Routers stay thin: parse the request, call a service, shape the response. Every decision
about what is allowed lives in app.jobs.service.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.db import SessionDep
from app.core.pagination import Page, PaginationDep
from app.jobs import service as job_service
from app.jobs.enums import JobStatus
from app.jobs.schemas import JobCreate, JobRead, JobUpdate
from app.publishing import service as publishing_service
from app.publishing.publisher import JobPublisherDep

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
    return Page[JobRead].of(jobs, total, pagination)


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
async def update_job(
    session: SessionDep, publisher: JobPublisherDep, job_id: uuid.UUID, payload: JobUpdate
) -> JobRead:
    job = await job_service.update_job(session, job_id, payload)
    # "When a recruiter publishes or updates a job", the brief says, the content
    # pipeline runs. A published job whose text changed is re-analysed in the
    # background; it stays published throughout.
    if job.status is JobStatus.PUBLISHED and payload.model_fields_set & (
        publishing_service.CONTENT_FIELDS
    ):
        await publishing_service.refresh_content(publisher, job)
    return JobRead.model_validate(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a job")
async def delete_job(session: SessionDep, job_id: uuid.UUID) -> None:
    await job_service.delete_job(session, job_id)


# --- Lifecycle transitions -------------------------------------------------------
# Modelled as named actions rather than PATCH status="closed". A transition has rules
# and side effects; a field edit implies neither. Publishing — the transition with the
# most side effects — lives in app/publishing/router.py.


@router.post("/{job_id}/close", response_model=JobRead, summary="Close a job")
async def close_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.close_job(session, job_id)
    return JobRead.model_validate(job)


@router.post("/{job_id}/reopen", response_model=JobRead, summary="Reopen a closed job")
async def reopen_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.reopen_job(session, job_id)
    return JobRead.model_validate(job)
