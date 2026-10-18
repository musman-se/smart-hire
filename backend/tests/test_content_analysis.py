"""Job content analysis — pure functions, so no database and no Temporal."""

from app.publishing.content import (
    KNOWN_SKILLS,
    break_down_description,
    extract_keywords,
    find_skills,
)

STRUCTURED = """We are hiring a backend engineer to scale our hiring platform.

Responsibilities:
- Design and operate FastAPI services
- Own the Kafka event pipeline

## Requirements
* 4+ years of Python
* Production experience with PostgreSQL

**What we offer**
1. Remote-first team
2. Annual learning budget
"""


def test_headings_split_the_description_into_sections() -> None:
    breakdown = break_down_description(STRUCTURED)

    assert breakdown.summary == ["We are hiring a backend engineer to scale our hiring platform."]
    assert breakdown.responsibilities == [
        "Design and operate FastAPI services",
        "Own the Kafka event pipeline",
    ]
    assert breakdown.requirements == [
        "4+ years of Python",
        "Production experience with PostgreSQL",
    ]
    assert breakdown.benefits == ["Remote-first team", "Annual learning budget"]


def test_without_headings_sentences_are_placed_by_cue_words() -> None:
    breakdown = break_down_description(
        "Join the platform team. You will build the publishing pipeline. "
        "You must have 3 years of Python experience. We offer health insurance and a bonus. "
        "The office is in Lahore."
    )

    assert breakdown.summary == ["Join the platform team.", "The office is in Lahore."]
    assert breakdown.responsibilities == ["You will build the publishing pipeline."]
    assert breakdown.requirements == ["You must have 3 years of Python experience."]
    assert breakdown.benefits == ["We offer health insurance and a bonus."]


def test_nothing_in_the_description_is_dropped() -> None:
    breakdown = break_down_description("Short role. Unclassifiable sentence here.")

    everything = [item for _, items in breakdown.items() for item in items]
    assert everything == ["Short role.", "Unclassifiable sentence here."]


def test_keywords_weight_the_title_and_ignore_stopwords() -> None:
    keywords = extract_keywords(
        "Kafka Platform Engineer",
        "Run the kafka platform with the team. Kafka experience is required.",
    )

    words = [k.keyword for k in keywords]
    assert words[0] == "kafka"  # 3 (title) + 2 (description)
    assert keywords[0].score == 1.0
    assert "the" not in words and "experience" not in words
    assert all(0 < k.score <= 1 for k in keywords)


def test_keywords_are_deterministic() -> None:
    first = extract_keywords("Data Engineer", "Spark pipelines and spark streaming at scale.")
    second = extract_keywords("Data Engineer", "Spark pipelines and spark streaming at scale.")

    assert first == second


def test_skills_match_whole_words_only() -> None:
    found = find_skills(
        "We use JavaScript and Node.js; Java is not required. C++ helps.",
        {"java", "javascript", "node.js", "c++"},
    )

    assert found == {"javascript": 1, "node.js": 1, "java": 1, "c++": 1}


def test_skills_count_mentions_and_match_hyphenated_phrases() -> None:
    found = find_skills(
        "Python, python and more Python. Machine learning a plus.",
        {"python", "machine-learning"},
    )

    assert found == {"python": 3, "machine-learning": 1}


def test_ambiguous_english_words_are_never_matched_from_text() -> None:
    found = find_skills("Ready to go? Less is more.", {"go", "less"} | KNOWN_SKILLS)

    assert "go" not in found and "less" not in found
