"""Candidate business logic."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.candidates.errors import CandidateNotFoundError, DuplicateEmailError
from app.candidates.models import Candidate
from app.candidates.schemas import CandidateCreate, CandidateUpdate
from app.skills.models import Skill
from app.skills.service import resolve_skills


async def get_candidate(session: AsyncSession, candidate_id: uuid.UUID) -> Candidate:
    candidate = await session.get(Candidate, candidate_id)
    if candidate is None:
        raise CandidateNotFoundError(candidate_id)
    return candidate


async def list_candidates(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    skill: str | None = None,
    search: str | None = None,
    min_experience: int | None = None,
) -> tuple[list[Candidate], int]:
    filters = []
    if skill:
        filters.append(Candidate.skill_set.any(Skill.name == skill.strip().lower()))
    if search:
        filters.append(Candidate.full_name.ilike(f"%{search.strip()}%"))
    if min_experience is not None:
        filters.append(Candidate.years_experience >= min_experience)

    total = await session.scalar(select(func.count()).select_from(Candidate).where(*filters)) or 0

    rows = await session.scalars(
        select(Candidate)
        .where(*filters)
        .order_by(Candidate.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total


async def create_candidate(session: AsyncSession, payload: CandidateCreate) -> Candidate:
    candidate = Candidate(**payload.model_dump(exclude={"skills"}))
    candidate.skill_set = await resolve_skills(session, payload.skills)
    session.add(candidate)

    try:
        await session.commit()
    except IntegrityError as exc:
        # The unique index on email is what actually guarantees this. A SELECT-then-INSERT
        # check would let two concurrent registrations both pass the check and race.
        await session.rollback()
        raise DuplicateEmailError(
            f"A candidate with email {payload.email} already exists."
        ) from exc

    await session.refresh(candidate)
    return candidate


async def update_candidate(
    session: AsyncSession, candidate_id: uuid.UUID, payload: CandidateUpdate
) -> Candidate:
    candidate = await get_candidate(session, candidate_id)

    changes = payload.model_dump(exclude_unset=True)
    if "skills" in changes:
        candidate.skill_set = await resolve_skills(session, changes.pop("skills") or [])
    for field, value in changes.items():
        setattr(candidate, field, value)

    await session.commit()
    await session.refresh(candidate)
    return candidate


async def delete_candidate(session: AsyncSession, candidate_id: uuid.UUID) -> None:
    candidate = await get_candidate(session, candidate_id)
    await session.delete(candidate)
    await session.commit()
