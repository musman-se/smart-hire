"""Skill name handling shared by every domain that lists skills."""

from typing import Annotated

from pydantic import AfterValidator, Field

from app.core.schemas import ReadModel

# Mirrors skills.name VARCHAR(64). Kept here rather than imported from the model so the
# schemas never depend on SQLAlchemy.
SKILL_NAME_MAX_LENGTH = 64

# Per job and per candidate. Every new name joins the shared vocabulary, and anyone can
# register: without a cap, one request could add thousands of rows (and past 32,767 it
# failed with a 500, asyncpg's limit on query parameters).
MAX_SKILLS = 50


def normalise_skill_names(value: list[str]) -> list[str]:
    """Trim, drop blanks, lowercase, de-duplicate — order preserved.

    Both jobs and candidates list skills, and the two lists are compared to decide
    eligibility. They must therefore be normalised by the same function, or "Python"
    on a job would never match "python" on a candidate.

    Raises ValueError for an over-long name, which Pydantic reports as a 422.
    """
    seen: dict[str, None] = {}
    for raw in value:
        skill = raw.strip().lower()
        if len(skill) > SKILL_NAME_MAX_LENGTH:
            raise ValueError(
                f"skill names are at most {SKILL_NAME_MAX_LENGTH} characters: {skill[:20]}..."
            )
        if skill:
            seen.setdefault(skill, None)
    return list(seen)


def _at_most_max_skills(value: list[str]) -> list[str]:
    if len(value) > MAX_SKILLS:
        raise ValueError(f"List at most {MAX_SKILLS} skills ({len(value)} given).")
    return value


# A list of skill names as a request carries it: normalised, then at most MAX_SKILLS —
# counted after duplicates and blanks are dropped, so "Python" and "python " are one.
# The raw list is bounded too (four times over), so no request makes the normaliser
# walk a list of any size. Jobs and candidates both use it, so the two lists can never
# be capped or cleaned differently.
SkillList = Annotated[
    list[str],
    Field(max_length=MAX_SKILLS * 4),
    AfterValidator(normalise_skill_names),
    AfterValidator(_at_most_max_skills),
]


class SkillRead(ReadModel):
    id: int
    name: str
