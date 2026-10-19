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


# The cases below pin down the rules of the original one-regex-per-skill matcher, which
# a faster rewrite once broke. Any boundary but a letter, digit, "+" or "#" separates.


def test_skills_joined_by_punctuation_are_each_found() -> None:
    found = find_skills(
        "Python/Django, HTML/CSS, React.js, Node.js/Express, C#.NET and CI/CD/GitOps.",
        KNOWN_SKILLS | {".net"},
    )

    assert {"python", "django", "html", "css", "react", "node.js", "c#", ".net", "ci/cd"} <= (
        found.keys()
    )


def test_a_skill_at_the_end_of_the_text_is_counted_once() -> None:
    assert find_skills("We use Kafka", {"kafka"}) == {"kafka": 1}
    assert find_skills("Kafka. Kafka", {"kafka"}) == {"kafka": 2}


def test_a_phrase_does_not_match_across_punctuation() -> None:
    assert find_skills("Machine. Learning is optional.", {"machine-learning"}) == {}


def test_a_dotted_skill_does_not_match_the_bare_word() -> None:
    assert find_skills("Net salary is competitive.", {".net"}) == {}
    assert find_skills("We ship on .NET 8.", {".net"}) == {".net": 1}


def test_non_ascii_skills_are_matched() -> None:
    assert find_skills("Fluent 日本語 required.", {"日本語"}) == {"日本語": 1}


def test_skill_results_are_deterministic_and_sorted() -> None:
    text = "Kafka, Docker, Python, Kubernetes, Redis and Terraform."

    results = [find_skills(text, set(KNOWN_SKILLS)) for _ in range(3)]

    assert results[0] == results[1] == results[2]
    assert list(results[0]) == sorted(results[0])
