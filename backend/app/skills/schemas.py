"""Skill name handling shared by every domain that lists skills."""

from app.core.schemas import ReadModel

# Mirrors skills.name VARCHAR(64). Kept here rather than imported from the model so the
# schemas never depend on SQLAlchemy.
SKILL_NAME_MAX_LENGTH = 64


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


class SkillRead(ReadModel):
    id: int
    name: str
