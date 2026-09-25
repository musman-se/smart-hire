"""Candidate endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import PaginationDep
from app.core.db import SessionDep
from app.schemas.candidate import CandidateCreate, CandidateRead, CandidateUpdate
from app.schemas.common import Page
from app.services import candidate_service

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
    return Page[CandidateRead](
        items=[CandidateRead.model_validate(c) for c in candidates],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post(
    "",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a candidate",
)
async def create_candidate(session: SessionDep, payload: CandidateCreate) -> CandidateRead:
    candidate = await candidate_service.create_candidate(session, payload)
    return CandidateRead.model_validate(candidate)


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
