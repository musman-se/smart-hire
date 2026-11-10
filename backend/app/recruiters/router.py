"""Recruiter endpoints: a recruiter reads and changes their own profile.

There is no POST: a recruiter's profile is created with their account, from the command
line (`python -m app.auth.cli create-recruiter`), never over HTTP.
"""

from fastapi import APIRouter

from app.auth.dependencies import RecruiterDep
from app.core.db import SessionDep
from app.recruiters import service as recruiter_service
from app.recruiters.schemas import RecruiterRead, RecruiterUpdate

router = APIRouter()


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
