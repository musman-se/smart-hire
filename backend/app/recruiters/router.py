"""Recruiter endpoints.

    GET   /recruiters/me                    your own profile (recruiter or admin)
    PATCH /recruiters/me                    change your name or title
    GET   /recruiters                       admin: everyone on the hiring team
    POST  /recruiters                       admin: add a recruiter -> an invitation link
    POST  /recruiters/{id}/invitation       admin: a new link for someone not set up yet
    POST  /recruiters/{id}/deactivate       admin: they can no longer sign in
    POST  /recruiters/{id}/reactivate       admin: undo that

Adding a recruiter takes no Idempotency-Key. The stored response would hold the
invitation token in Redis for a day; a retried request gets 409 duplicate_email instead,
and the admin asks for a new link for that person.
"""

import uuid

from fastapi import APIRouter, status

from app.auth.dependencies import AdminDep, RecruiterDep
from app.core.db import SessionDep
from app.core.pagination import Page, PaginationDep
from app.core.schemas import ErrorResponse
from app.recruiters import service as recruiter_service
from app.recruiters.schemas import (
    InvitationIssued,
    RecruiterInvite,
    RecruiterInvited,
    RecruiterRead,
    RecruiterUpdate,
    StaffMemberRead,
)

router = APIRouter()

_CONFLICT = {409: {"model": ErrorResponse}}


@router.get("/me", response_model=RecruiterRead, summary="Your recruiter profile")
async def get_my_profile(session: SessionDep, user: RecruiterDep) -> RecruiterRead:
    recruiter = await recruiter_service.get_recruiter(session, user.id)
    return RecruiterRead.model_validate(recruiter)


@router.patch("/me", response_model=RecruiterRead, summary="Update your recruiter profile")
async def update_my_profile(
    session: SessionDep, user: RecruiterDep, payload: RecruiterUpdate
) -> RecruiterRead:
    updated = await recruiter_service.update_recruiter(session, user.id, payload)
    return RecruiterRead.model_validate(updated)


@router.get(
    "",
    response_model=Page[StaffMemberRead],
    summary="List the hiring team",
    description="Admins only. Every recruiter and admin, deactivated ones included.",
)
async def list_staff(
    session: SessionDep, _: AdminDep, pagination: PaginationDep
) -> Page[StaffMemberRead]:
    members, total = await recruiter_service.list_staff(
        session, limit=pagination.limit, offset=pagination.offset
    )
    return Page[StaffMemberRead].of(members, total, pagination)


@router.post(
    "",
    response_model=RecruiterInvited,
    status_code=status.HTTP_201_CREATED,
    summary="Add a recruiter",
    description=(
        "Admins only. Creates the account and profile with no password, and returns an "
        "invitation token, shown this once. The recruiter opens the link built from it "
        "and chooses their own password."
    ),
    responses={409: {"model": ErrorResponse, "description": "The email already has an account"}},
)
async def invite_recruiter(
    session: SessionDep, admin: AdminDep, payload: RecruiterInvite
) -> RecruiterInvited:
    return await recruiter_service.invite_recruiter(session, payload, admin=admin)


@router.post(
    "/{recruiter_id}/invitation",
    response_model=InvitationIssued,
    status_code=status.HTTP_201_CREATED,
    summary="Send a new invitation link",
    description=(
        "Admins only. For someone who has not set a password yet. The old link stops working."
    ),
    responses=_CONFLICT,
)
async def reissue_invitation(
    session: SessionDep, admin: AdminDep, recruiter_id: uuid.UUID
) -> InvitationIssued:
    return await recruiter_service.reissue_invitation(session, recruiter_id, admin=admin)


@router.post(
    "/{recruiter_id}/deactivate",
    response_model=StaffMemberRead,
    summary="Deactivate a recruiter or admin",
    description=(
        "Admins only. They can no longer sign in, and every session they have ends at once. "
        "Their profile and their name on past work stay. You cannot deactivate yourself."
    ),
    responses=_CONFLICT,
)
async def deactivate(
    session: SessionDep, admin: AdminDep, recruiter_id: uuid.UUID
) -> StaffMemberRead:
    return await recruiter_service.deactivate(session, recruiter_id, admin=admin)


@router.post(
    "/{recruiter_id}/reactivate",
    response_model=StaffMemberRead,
    summary="Reactivate a recruiter or admin",
    description="Admins only. They sign in with their old password again.",
)
async def reactivate(
    session: SessionDep, admin: AdminDep, recruiter_id: uuid.UUID
) -> StaffMemberRead:
    return await recruiter_service.reactivate(session, recruiter_id, admin=admin)
