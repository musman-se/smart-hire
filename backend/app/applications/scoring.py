"""Match scoring — how well a candidate fits a job, 0 to 100. Pure functions.

A deliberately simple, explainable baseline (the brief: "basic simulation"):

    required skills    60%   share of the job's required skills the candidate has
    experience         25%   candidate years / job minimum, capped at 1
    other skills       15%   share of the *other* skills the description mentions
                             (the publishing workflow's extracted skills)

A component with nothing to measure — no required skills, no minimum experience,
nothing extra mentioned — counts in full: no evidence against the candidate. So scores
rank candidates *within* one job; across jobs they are not comparable.

Module 4 replaces this with semantic similarity between resume and description. The
workflow that calls it does not change.
"""

from dataclasses import dataclass

REQUIRED_WEIGHT = 0.60
EXPERIENCE_WEIGHT = 0.25
OTHER_SKILLS_WEIGHT = 0.15


@dataclass(frozen=True)
class MatchScore:
    score: float  # 0..100, one decimal
    required_matched: int
    required_total: int
    other_matched: int
    other_total: int
    experience_ratio: float  # 0..1


def _share(have: set[str], wanted: set[str]) -> float:
    return len(have & wanted) / len(wanted) if wanted else 1.0


def score_match(
    *,
    candidate_skills: set[str],
    candidate_years: int,
    required_skills: set[str],
    mentioned_skills: set[str],
    min_years: int,
) -> MatchScore:
    other = mentioned_skills - required_skills
    experience = min(1.0, candidate_years / min_years) if min_years > 0 else 1.0
    raw = (
        REQUIRED_WEIGHT * _share(candidate_skills, required_skills)
        + EXPERIENCE_WEIGHT * experience
        + OTHER_SKILLS_WEIGHT * _share(candidate_skills, other)
    )
    return MatchScore(
        score=round(100 * raw, 1),
        required_matched=len(candidate_skills & required_skills),
        required_total=len(required_skills),
        other_matched=len(candidate_skills & other),
        other_total=len(other),
        experience_ratio=round(experience, 3),
    )
