"""Candidate endpoints.

There is no POST here: a candidate profile is created with its account, by
POST /auth/register. The rest follows one rule — recruiters read every profile, and a
candidate reads and changes only their own.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.auth.dependencies import CandidateDep, CurrentUserDep, require_recruiter
from app.auth.enums import Role
from app.candidates import service as candidate_service
from app.candidates.errors import CandidateNotFoundError
from app.candidates.schemas import CandidateRead, CandidateUpdate
from app.core.db import SessionDep
from app.core.pagination import Page, PaginationDep
from app.core.schemas import QueryText

router = APIRouter()


def _check_own(user_id: uuid.UUID, candidate_id: uuid.UUID) -> None:
    """Someone else's profile answers 404, not 403. A 403 would confirm the id exists —
    letting anyone holding a list of ids learn which belong to real candidates."""
    if user_id != candidate_id:
        raise CandidateNotFoundError(candidate_id)


@router.get(
    "",
    response_model=Page[CandidateRead],
    summary="List candidates",
    dependencies=[Depends(require_recruiter)],
)
async def list_candidates(
    session: SessionDep,
    pagination: PaginationDep,
    skill: Annotated[QueryText | None, Query(description="Match one skill")] = None,
    search: Annotated[QueryText | None, Query(description="Case-insensitive name match")] = None,
    min_experience: Annotated[int | None, Query(ge=0)] = None,
    ids: Annotated[
        list[uuid.UUID] | None,
        Query(
            max_length=100,
            description=(
                "Only these candidates, e.g. the applicants on one page — one request "
                "instead of one per candidate. Repeat the parameter for each id."
            ),
        ),
    ] = None,
) -> Page[CandidateRead]:
    candidates, total = await candidate_service.list_candidates(
        session,
        limit=pagination.limit,
        offset=pagination.offset,
        skill=skill,
        search=search,
        min_experience=min_experience,
        ids=ids,
    )
    return Page[CandidateRead].of(candidates, total, pagination)


@router.get(
    "/{candidate_id}",
    response_model=CandidateRead,
    summary="Get one candidate",
    description="A recruiter may read any profile; a candidate only their own.",
)
async def get_candidate(
    session: SessionDep, user: CurrentUserDep, candidate_id: uuid.UUID
) -> CandidateRead:
    if user.role is Role.CANDIDATE:
        _check_own(user.id, candidate_id)
    candidate = await candidate_service.get_candidate(session, candidate_id)
    return CandidateRead.model_validate(candidate)


@router.patch("/{candidate_id}", response_model=CandidateRead, summary="Update your profile")
async def update_candidate(
    session: SessionDep, user: CandidateDep, candidate_id: uuid.UUID, payload: CandidateUpdate
) -> CandidateRead:
    _check_own(user.id, candidate_id)
    updated = await candidate_service.update_candidate(session, candidate_id, payload)
    return CandidateRead.model_validate(updated)


@router.delete(
    "/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete your account",
    description="Deletes the account, the profile and every application, irreversibly.",
)
async def delete_candidate(
    session: SessionDep, user: CandidateDep, candidate_id: uuid.UUID
) -> None:
    _check_own(user.id, candidate_id)
    await candidate_service.delete_candidate(session, candidate_id)
