"""Skill lookups shared by jobs and candidates."""

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.skills.models import Skill


async def resolve_skills(session: AsyncSession, names: Iterable[str]) -> list[Skill]:
    """Return the Skill rows for these names, creating any that do not exist yet.

    Names must already be normalised (see `normalise_skill_names`). The result is sorted
    by name — the same order the relationship loads in — so a job reads back identically
    whether it was just written or freshly fetched.

    Safe under concurrency. Two requests introducing "kafka" at the same moment both run
    INSERT ... ON CONFLICT DO NOTHING: one inserts, the other waits on the unique index
    and then does nothing. The SELECT that follows is a new statement, so under READ
    COMMITTED it sees the row either way. A SELECT-then-INSERT here would race.
    """
    unique = sorted(set(names))
    if not unique:
        return []

    await session.execute(
        insert(Skill)
        .values([{"name": name} for name in unique])
        .on_conflict_do_nothing(index_elements=[Skill.name])
    )
    rows = await session.scalars(select(Skill).where(Skill.name.in_(unique)).order_by(Skill.name))
    return list(rows)


async def list_skills(
    session: AsyncSession, *, limit: int, offset: int, search: str | None = None
) -> tuple[list[Skill], int]:
    """The skill vocabulary — what a recruiter's skill picker autocompletes against."""
    filters = []
    if search:
        filters.append(Skill.name.startswith(search.strip().lower(), autoescape=True))

    total = await session.scalar(select(func.count()).select_from(Skill).where(*filters)) or 0
    rows = await session.scalars(
        select(Skill).where(*filters).order_by(Skill.name).limit(limit).offset(offset)
    )
    return list(rows), total
