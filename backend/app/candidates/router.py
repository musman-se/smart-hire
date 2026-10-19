"""Candidate endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import JSONResponse

from app.candidates import service as candidate_service
from app.candidates.schemas import CandidateCreate, CandidateRead, CandidateUpdate
from app.core.db import SessionDep
from app.core.idempotency import IdempotencyDep, IdempotencyKey
from app.core.pagination import Page, PaginationDep

router = APIRouter()


@router.get("", response_model=Page[CandidateRead], summary="List candidates")
async def list_candidates(
    session: SessionDep,
    pagination: PaginationDep,
    skill: Annotated[str | None, Query(description="Match one skill")] = None,
    search: Annotated[str | None, Query(description="Case-insensitive name match")] = None,
    min_experience: Annotated[int | None, Query(ge=0)] = None,
) -> Page[CandidateRead]:
    candidates, total = await candidate_service.list_candidates(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        skill=skill,
        search=search,
        min_experience=min_experience,
    )
    return Page[CandidateRead].of(candidates, total, pagination)


@router.post(
    "",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a candidate",
)
async def create_candidate(
    session: SessionDep,
    idempotency: IdempotencyDep,
    request: Request,
    payload: CandidateCreate,
    idempotency_key: IdempotencyKey = None,
) -> JSONResponse:
    async def create() -> CandidateRead:
        return CandidateRead.model_validate(
            await candidate_service.create_candidate(session, payload)
        )

    return await idempotency.run(
        key=idempotency_key,
        request=request,
        body=payload,
        status_code=status.HTTP_201_CREATED,
        operation=create,
    )


@router.get("/{candidate_id}", response_model=CandidateRead, summary="Get one candidate")
async def get_candidate(session: SessionDep, candidate_id: uuid.UUID) -> CandidateRead:
    candidate = await candidate_service.get_candidate(session, candidate_id)
    return CandidateRead.model_validate(candidate)


@router.patch("/{candidate_id}", response_model=CandidateRead, summary="Update a profile")
async def update_candidate(
    session: SessionDep, candidate_id: uuid.UUID, payload: CandidateUpdate
) -> CandidateRead:
    candidate = await candidate_service.update_candidate(session, candidate_id, payload)
    return CandidateRead.model_validate(candidate)


@router.delete(
    "/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a candidate"
)
async def delete_candidate(session: SessionDep, candidate_id: uuid.UUID) -> None:
    await candidate_service.delete_candidate(session, candidate_id)
