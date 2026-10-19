"""Publishing endpoints, nested under the job they act on."""

import uuid

from fastapi import APIRouter, status

from app.core.db import SessionDep
from app.jobs.schemas import JobRead
from app.publishing import service as publishing_service
from app.publishing.publisher import JobPublisherDep
from app.publishing.schemas import JobContentRead, PublicationRead

router = APIRouter()


@router.post(
    "/{job_id}/publish",
    response_model=JobRead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Publish a job",
    description=(
        "Starts the publishing workflow and returns at once with the job in `processing`. "
        "It becomes `published` when skills and content have been extracted, or "
        "`publish_failed` with a reason. Follow progress at `/jobs/{job_id}/publication`."
    ),
    responses={
        409: {"description": "The job is closed"},
        503: {"description": "The workflow engine is unreachable; nothing was changed"},
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
