"""Job endpoints.

Routers stay thin: parse the request, call a service, shape the response. Every decision
about what is allowed lives in app.jobs.service — except *who* may ask, which is decided
here, at the boundary: recruiters manage jobs; candidates read the published ones.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse

from app.auth.dependencies import CurrentUserDep, RecruiterDep, require_recruiter
from app.auth.enums import Role
from app.auth.models import User
from app.core.db import SessionDep
from app.core.idempotency import IdempotencyDep, IdempotencyKey
from app.core.pagination import Page, PaginationDep
from app.core.schemas import QueryText
from app.jobs import service as job_service
from app.jobs.enums import JobStatus
from app.jobs.errors import JobNotFoundError
from app.jobs.models import Job
from app.jobs.schemas import JobCreate, JobRead, JobUpdate
from app.publishing import service as publishing_service
from app.publishing.publisher import JobPublisherDep

router = APIRouter()

# Drafts, jobs mid-publish, failed publishes and closed jobs are the recruiter's business.
# A candidate sees a job only while it is open for applications.
CANDIDATE_VISIBLE = JobStatus.PUBLISHED

recruiter_only = [Depends(require_recruiter)]


def _as_seen_by(user: User, job: Job) -> JobRead:
    """publish_error is the recruiter's diagnostic — it can name a failed analysis on a
    live job — not something a candidate reading the posting should see."""
    read = JobRead.model_validate(job)
    if user.role is Role.CANDIDATE:
        return read.model_copy(update={"publish_error": None})
    return read


@router.get(
    "",
    response_model=Page[JobRead],
    summary="List jobs",
    description=(
        "A candidate sees published jobs only; asking for any other `status` returns an empty page."
    ),
)
async def list_jobs(
    session: SessionDep,
    user: CurrentUserDep,
    pagination: PaginationDep,
    status_filter: Annotated[JobStatus | None, Query(alias="status")] = None,
    skill: Annotated[QueryText | None, Query(description="Match one required skill")] = None,
    search: Annotated[QueryText | None, Query(description="Case-insensitive title match")] = None,
) -> Page[JobRead]:
    if user.role is Role.CANDIDATE:
        if status_filter not in (None, CANDIDATE_VISIBLE):
            return Page[JobRead].of([], 0, pagination)
        status_filter = CANDIDATE_VISIBLE

    jobs, total = await job_service.list_jobs(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        status=status_filter,
        skill=skill,
        search=search,
    )
    return Page[JobRead].of([_as_seen_by(user, job) for job in jobs], total, pagination)


@router.post(
    "", response_model=JobRead, status_code=status.HTTP_201_CREATED, summary="Create a job"
)
async def create_job(
    session: SessionDep,
    recruiter: RecruiterDep,
    idempotency: IdempotencyDep,
    request: Request,
    payload: JobCreate,
    idempotency_key: IdempotencyKey = None,
) -> JSONResponse:
    # A job has no natural unique key, so without an Idempotency-Key a retried POST
    # creates a second, identical job.
    async def create() -> JobRead:
        return JobRead.model_validate(await job_service.create_job(session, payload))

    return await idempotency.run(
        key=idempotency_key,
        owner=recruiter.id,
        request=request,
        body=payload,
        status_code=status.HTTP_201_CREATED,
        operation=create,
    )


@router.get(
    "/status-counts",
    response_model=dict[JobStatus, int],
    summary="Count jobs by status",
    description="Recruiters only. Every status, zero included, in one request.",
    dependencies=recruiter_only,
)
async def count_jobs_by_status(session: SessionDep) -> dict[JobStatus, int]:
    return await job_service.count_by_status(session)


@router.get(
    "/{job_id}",
    response_model=JobRead,
    summary="Get one job",
    description=(
        "A candidate may read a published job, and a closed one they applied to — so "
        "their applications keep pointing somewhere."
    ),
)
async def get_job(session: SessionDep, user: CurrentUserDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.get_job(session, job_id)
    if user.role is Role.CANDIDATE and job.status is not CANDIDATE_VISIBLE:
        # Only closed, not every unpublished state: a job reopened as a draft may be
        # being rewritten for a different role, and that must not reach anyone before
        # it is published — past applicants included. 404, not 403: to everyone else an
        # unpublished job does not exist yet.
        applied_before_it_closed = job.status is JobStatus.CLOSED and (
            await job_service.has_applied(session, job_id, user.id)
        )
        if not applied_before_it_closed:
            raise JobNotFoundError(job_id)
    return _as_seen_by(user, job)


@router.patch(
    "/{job_id}", response_model=JobRead, summary="Update a job", dependencies=recruiter_only
)
async def update_job(
    session: SessionDep, publisher: JobPublisherDep, job_id: uuid.UUID, payload: JobUpdate
) -> JobRead:
    job, content_changed = await job_service.update_job(session, job_id, payload)
    # "When a recruiter publishes or updates a job", the brief says, the content
    # pipeline runs. A published job whose title, description or skills actually
    # changed is re-analysed in the background; it stays published throughout.
    if job.status is JobStatus.PUBLISHED and content_changed:
        await publishing_service.refresh_content(session, publisher, job)
    return JobRead.model_validate(job)


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a job",
    dependencies=recruiter_only,
)
async def delete_job(session: SessionDep, job_id: uuid.UUID) -> None:
    await job_service.delete_job(session, job_id)


# --- Lifecycle transitions -------------------------------------------------------
# Modelled as named actions rather than PATCH status="closed". A transition has rules
# and side effects; a field edit implies neither. Publishing — the transition with the
# most side effects — lives in app/publishing/router.py.


@router.post(
    "/{job_id}/close", response_model=JobRead, summary="Close a job", dependencies=recruiter_only
)
async def close_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.close_job(session, job_id)
    return JobRead.model_validate(job)


@router.post(
    "/{job_id}/reopen",
    response_model=JobRead,
    summary="Reopen a closed job",
    dependencies=recruiter_only,
)
async def reopen_job(session: SessionDep, job_id: uuid.UUID) -> JobRead:
    job = await job_service.reopen_job(session, job_id)
    return JobRead.model_validate(job)
