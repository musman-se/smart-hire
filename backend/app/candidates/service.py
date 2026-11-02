"""Candidate business logic."""

import logging
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.enums import Role
from app.auth.errors import DuplicateEmailError
from app.auth.models import User
from app.auth.security import hash_password
from app.candidates.errors import CandidateNotFoundError
from app.candidates.models import Candidate
from app.candidates.schemas import CandidateRegistration, CandidateUpdate
from app.skills.models import Skill
from app.skills.service import resolve_skills

logger = logging.getLogger(__name__)


async def get_candidate(
    session: AsyncSession, candidate_id: uuid.UUID, *, lock: bool = False
) -> Candidate:
    """Load a candidate, optionally row-locked until the transaction ends (see get_job).

    The lock is taken `of` the candidates table only. The account is joined into the
    same SELECT, and a bare FOR NO KEY UPDATE would lock its users row as well.
    """
    candidate = await session.get(
        Candidate,
        candidate_id,
        with_for_update={"key_share": True, "of": Candidate} if lock else None,
        populate_existing=lock,
    )
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


async def register_candidate(session: AsyncSession, payload: CandidateRegistration) -> Candidate:
    """Create a candidate's account and profile together, in one transaction.

    Neither exists without the other: a failure anywhere — a duplicate email, say —
    rolls both back.
    """
    # Hashed before the transaction starts, so no pooled connection waits on the hasher.
    password_hash = await hash_password(payload.password.get_secret_value())

    user = User(
        id=uuid.uuid4(), email=payload.email, password_hash=password_hash, role=Role.CANDIDATE
    )
    candidate = Candidate(
        id=user.id,
        user=user,  # the relationship is what orders the INSERTs: users first
        **payload.model_dump(exclude={"email", "password", "skills"}),
    )
    candidate.skill_set = await resolve_skills(session, payload.skills)
    session.add(candidate)

    try:
        await session.commit()
    except IntegrityError as exc:
        # The unique index on users.email is what actually guarantees this. A
        # SELECT-then-INSERT check would let two concurrent registrations both pass the
        # check and race.
        await session.rollback()
        # The message names no email: domain errors are logged, and an address is
        # personal data.
        raise DuplicateEmailError("An account with this email already exists.") from exc

    logger.info("candidate_registered id=%s", candidate.id)
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
    return candidate


async def delete_candidate(session: AsyncSession, candidate_id: uuid.UUID) -> None:
    """Delete the account, not just the profile. ON DELETE CASCADE then removes the
    profile, its applications and its refresh tokens — deleting only the profile would
    leave an account that can still sign in, attached to nothing."""
    await get_candidate(session, candidate_id)
    await session.execute(delete(User).where(User.id == candidate_id))
    await session.commit()
