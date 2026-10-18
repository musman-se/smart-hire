"""Skill name handling shared by every domain that lists skills."""


def normalise_skill_names(value: list[str]) -> list[str]:
    """Trim, drop blanks, lowercase, de-duplicate — order preserved.

    Both jobs and candidates list skills, and the two lists are compared to decide
    eligibility. They must therefore be normalised by the same function, or "Python"
    on a job would never match "python" on a candidate.
    """
    seen: dict[str, None] = {}
    for raw in value:
        skill = raw.strip().lower()
        if skill:
            seen.setdefault(skill, None)
    return list(seen)
