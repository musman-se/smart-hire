"""Recruiter business logic.

A recruiter profile is created with its account, by auth.service.create_recruiter — the
command line is the only way in (see app/auth/cli.py). Here a recruiter reads and
changes their own.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.recruiters.errors import RecruiterNotFoundError
from app.recruiters.models import Recruiter
from app.recruiters.schemas import RecruiterUpdate


async def get_recruiter(session: AsyncSession, recruiter_id: uuid.UUID) -> Recruiter:
    recruiter = await session.get(Recruiter, recruiter_id)
    if recruiter is None:
        raise RecruiterNotFoundError(recruiter_id)
    return recruiter


async def update_recruiter(
    session: AsyncSession, recruiter_id: uuid.UUID, payload: RecruiterUpdate
) -> Recruiter:
    recruiter = await get_recruiter(session, recruiter_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(recruiter, field, value)
    await session.commit()
    return recruiter
