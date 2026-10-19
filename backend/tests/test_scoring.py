"""Match scoring — pure arithmetic, so each weight can be checked by hand."""

from app.applications.scoring import score_match


def score(**overrides) -> float:
    params = {
        "candidate_skills": {"python", "postgresql"},
        "candidate_years": 5,
        "required_skills": {"python", "postgresql"},
        "mentioned_skills": set(),
        "min_years": 4,
    } | overrides
    return score_match(**params).score


def test_a_perfect_fit_scores_100() -> None:
    assert score() == 100.0


def test_nothing_to_measure_counts_in_full() -> None:
    assert score(required_skills=set(), min_years=0, candidate_skills=set()) == 100.0


def test_required_skills_carry_60_percent() -> None:
    # Half the required skills: 60 * 0.5 + 25 + 15
    assert score(candidate_skills={"python"}) == 70.0


def test_experience_carries_25_percent_and_is_capped() -> None:
    assert score(candidate_years=2) == 87.5  # 60 + 25 * (2/4) + 15
    assert score(candidate_years=40) == 100.0  # beyond the minimum earns nothing extra


def test_skills_the_description_mentions_carry_15_percent() -> None:
    # Mentioned but not required: kafka and docker. The candidate has one of the two.
    result = score_match(
        candidate_skills={"python", "postgresql", "docker"},
        candidate_years=5,
        required_skills={"python", "postgresql"},
        mentioned_skills={"python", "kafka", "docker"},
        min_years=4,
    )

    assert result.score == 92.5  # 60 + 25 + 15 * (1/2)
    assert (result.other_matched, result.other_total) == (1, 2)
