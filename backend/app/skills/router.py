"""Skill endpoints — the shared vocabulary, read-only.

Skills are created implicitly, the first time a job or candidate lists one. There is no
POST here on purpose: a vocabulary anyone can write to directly fills with near-duplicates.
"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.core.pagination import Page, PaginationDep
from app.skills import service as skill_service
from app.skills.schemas import SkillRead

router = APIRouter()


@router.get("", response_model=Page[SkillRead], summary="List known skills")
async def list_skills(
    session: SessionDep,
    pagination: PaginationDep,
    search: Annotated[str | None, Query(description="Prefix match, e.g. 'py'")] = None,
) -> Page[SkillRead]:
    skills, total = await skill_service.list_skills(
        session, limit=pagination.limit, offset=pagination.offset, search=search
    )
    return Page[SkillRead].of(skills, total, pagination)
