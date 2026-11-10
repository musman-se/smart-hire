"""Publishing endpoints, nested under the job they act on. Recruiters only: publishing
is how a job is prepared for candidates, and its status and extracted content describe
the recruiter's pipeline, not the posting."""

import uuid

from fastapi import APIRouter, Depends, status

from app.auth.dependencies import require_recruiter
from app.core.db import SessionDep
from app.core.schemas import ErrorResponse
from app.jobs.schemas import JobRead
from app.publishing import service as publishing_service
from app.publishing.publisher import JobPublisherDep
from app.publishing.schemas import JobContentRead, PublicationRead

router = APIRouter(dependencies=[Depends(require_recruiter)])


@router.post(
    "/{job_id}/publish",
    response_model=JobRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Publish a job",
    description=(
        "Starts the publishing workflow and returns at once with the job in `processing`. "
        "It becomes `published` when skills and content have been extracted, or "
        "`publish_failed` with a reason. Follow progress at `/jobs/{job_id}/publication`. "
        "On a job that is already published it re-runs the analysis; the job stays "
        "published."
    ),
    responses={
        409: {"model": ErrorResponse, "description": "The job is closed"},
        503: {
            "model": ErrorResponse,
            "description": (
                "`workflow_unavailable`: the workflow engine is unreachable, nothing was "
                "changed. `workflow_start_unknown`: it did not answer in time — the run "
                "may have started, so the job stays `processing`; publish again if it "
                "is still stuck."
            ),
        },
    },
)
async def publish_job(
    session: SessionDep, publisher: JobPublisherDep, job_id: uuid.UUID
) -> JobRead:
    job = await publishing_service.publish_job(session, publisher, job_id)
    return JobRead.model_validate(job)


@router.get(
    "/{job_id}/publication",
    response_model=PublicationRead,
    summary="Publishing status",
)
async def get_publication(
    session: SessionDep, publisher: JobPublisherDep, job_id: uuid.UUID
) -> PublicationRead:
    return await publishing_service.get_publication(session, publisher, job_id)


@router.get(
    "/{job_id}/content",
    response_model=JobContentRead,
    summary="Structured content extracted from the description",
)
async def get_content(session: SessionDep, job_id: uuid.UUID) -> JobContentRead:
    return await publishing_service.get_content(session, job_id)
