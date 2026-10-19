"""Job content analysis — pure functions from text to structure.

Nothing here touches the database, the network or Temporal. Each function takes strings
and returns plain data, which is what makes it safe to call from a Temporal activity
(retried freely, same input, same output) and trivial to unit-test.

The analysis is deliberately rule-based: headings, cue words, a skill vocabulary and
word counts. It is predictable, fast and explainable to a reviewer line by line. Module 4
replaces matching-by-spelling with embeddings; the workflow around it will not change.
"""

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from app.publishing.enums import SectionKind

# --------------------------------------------------------------------------- sections


@dataclass
class DescriptionBreakdown:
    """A description split into the components the brief names."""

    summary: list[str] = field(default_factory=list)
    responsibilities: list[str] = field(default_factory=list)
    requirements: list[str] = field(default_factory=list)
    benefits: list[str] = field(default_factory=list)

    def items(self) -> list[tuple[SectionKind, list[str]]]:
        return [
            (SectionKind.SUMMARY, self.summary),
            (SectionKind.RESPONSIBILITY, self.responsibilities),
            (SectionKind.REQUIREMENT, self.requirements),
            (SectionKind.BENEFIT, self.benefits),
        ]


# Headings recruiters actually write, normalised to lowercase without punctuation.
HEADINGS: dict[SectionKind, tuple[str, ...]] = {
    SectionKind.SUMMARY: ("about the role", "about us", "overview", "summary", "the role"),
    SectionKind.RESPONSIBILITY: (
        "responsibilities",
        "key responsibilities",
        "what you will do",
        "what youll do",
        "your role",
        "duties",
        "day to day",
        "the job",
    ),
    SectionKind.REQUIREMENT: (
        "requirements",
        "qualifications",
        "what we are looking for",
        "what were looking for",
        "what you will need",
        "what youll need",
        "what you bring",
        "must have",
        "must haves",
        "nice to have",
        "nice to haves",
        "skills",
        "who you are",
    ),
    SectionKind.BENEFIT: (
        "benefits",
        "perks",
        "what we offer",
        "compensation",
        "why join us",
        "why you will love it here",
    ),
}

# For descriptions with no headings, sentences are classified by cue words instead.
# Checked in this order: benefits are the most specific signal, responsibilities the least.
CUES: list[tuple[SectionKind, re.Pattern[str]]] = [
    (
        SectionKind.BENEFIT,
        re.compile(
            r"\b(we offer|benefits?|salary|compensation|insurance|bonus|equity|stock options?"
            r"|paid leave|vacation|perks?|learning budget|flexible hours)\b",
            re.IGNORECASE,
        ),
    ),
    (
        SectionKind.REQUIREMENT,
        re.compile(
            r"\b(experience|years|required|requires?|must|proficien\w*|knowledge of|familiar"
            r"|degree|background in|you have|you bring|strong understanding)\b",
            re.IGNORECASE,
        ),
    ),
    (
        SectionKind.RESPONSIBILITY,
        re.compile(
            r"\b(you will|you'll|responsib\w*|build|design|develop|lead|maintain|operate"
            r"|own|collaborat\w*|work (with|on|alongside)|ship|mentor)\b",
            re.IGNORECASE,
        ),
    ),
]

_BULLET = re.compile(r"^\s*(?:[-*•·▪–]|\d+[.)])\s+")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


def _heading_kind(line: str) -> SectionKind | None:
    """The section a line introduces, if it is a heading."""
    text = line.strip().strip("#*_ ").rstrip(":").strip("*_ ")
    if not text or len(text) > 60 or _BULLET.match(line):
        return None
    key = re.sub(r"[^a-z ]", "", text.lower()).strip()
    key = re.sub(r"\s+", " ", key)
    for kind, phrases in HEADINGS.items():
        if key in phrases:
            return kind
    return None


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_END.split(text) if s.strip()]


def _items(lines: list[str]) -> list[str]:
    """Bullets become one item each; a prose paragraph becomes one item per sentence."""
    items: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        if _BULLET.match(line):
            items.append(_BULLET.sub("", line).strip())
        else:
            items.extend(_sentences(line))
    return items


def _target(breakdown: DescriptionBreakdown, kind: SectionKind) -> list[str]:
    return dict(breakdown.items())[kind]


def break_down_description(description: str) -> DescriptionBreakdown:
    """Split a description into summary, responsibilities, requirements and benefits.

    With headings ("Responsibilities:", "## What we offer", "**Requirements**"), each
    heading's lines go to its section and text before the first heading is the summary.
    Without any, the first sentence is the summary and each later sentence is placed by
    its cue words — anything unrecognised stays in the summary, so nothing is dropped.
    """
    lines = description.replace("\r\n", "\n").split("\n")
    breakdown = DescriptionBreakdown()

    if any(_heading_kind(line) for line in lines):
        current = SectionKind.SUMMARY
        buffer: list[str] = []
        for line in lines:
            kind = _heading_kind(line)
            if kind is not None:
                _target(breakdown, current).extend(_items(buffer))
                current, buffer = kind, []
            else:
                buffer.append(line)
        _target(breakdown, current).extend(_items(buffer))
        return breakdown

    sentences = _items(lines)
    if not sentences:
        return breakdown
    breakdown.summary.append(sentences[0])
    for sentence in sentences[1:]:
        kind = next((k for k, cue in CUES if cue.search(sentence)), SectionKind.SUMMARY)
        _target(breakdown, kind).append(sentence)
    return breakdown


# --------------------------------------------------------------------------- keywords

STOPWORDS = frozenset(
    """
    a about above after again all also am an and any are as at be because been before being
    below between both but by can could did do does doing down during each few for from
    further had has have having he her here hers him his how i if in into is it its itself
    just me more most my no nor not now of off on once only or other our ours out over own
    same she should so some such than that the their theirs them then there these they this
    those through to too under until up very was we were what when where which while who whom
    why will with would you your yours yourself
    able ability across alongside based best both etc every get including join looking make
    many new one per plus role roles strong team teams using want well within work working
    year years experience candidate candidates company job jobs position opportunity
    responsibilities requirements qualifications benefits you'll we're we'll it's
    """.split()
)

_TOKEN = re.compile(r"[a-z][a-z0-9+#]*(?:[.\-][a-z0-9+#]+)*")

# job_keywords.keyword is VARCHAR(64); job_keywords.score must be > 0.
KEYWORD_MAX_LENGTH = 64
MIN_KEYWORD_SCORE = 0.001


@dataclass
class Keyword:
    keyword: str
    score: float


def extract_keywords(title: str, description: str, *, limit: int = 12) -> list[Keyword]:
    """The terms that characterise a job, weighted relative to the strongest.

    Term frequency with stopwords removed; a word in the title counts three times,
    because a title is the recruiter's own one-line summary. Scores are in (0, 1], the
    top term scoring 1.0. Ties sort alphabetically, so the output is deterministic.

    Both limits of the job_keywords table are respected here, where they can be: a term
    is cut to 64 characters *before* counting, so two long terms that share a prefix
    merge instead of colliding on the (job_id, keyword) primary key; and a score never
    rounds down to 0, which the score > 0 check would refuse.
    """
    counts: Counter[str] = Counter()
    for weight, text in ((3, title), (1, description)):
        for token in _TOKEN.findall(text.lower()):
            token = token.strip(".-")[:KEYWORD_MAX_LENGTH]
            if len(token) >= 3 and token not in STOPWORDS and not token.isdigit():
                counts[token] += weight

    if not counts:
        return []
    top = max(counts.values())
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    return [
        Keyword(keyword=word, score=max(round(count / top, 3), MIN_KEYWORD_SCORE))
        for word, count in ranked
    ]


# ----------------------------------------------------------------------------- skills

# A starter vocabulary, so a fresh installation recognises common skills before any job
# or candidate has listed them. Everything in the skills table is matched as well.
KNOWN_SKILLS = frozenset(
    """
    python java javascript typescript kotlin scala ruby php rust swift elixir c++ c#
    fastapi django flask spring node.js express react angular vue next.js svelte
    postgresql mysql mongodb redis elasticsearch cassandra sqlite dynamodb sql nosql
    kafka rabbitmq celery temporal airflow spark hadoop
    docker kubernetes terraform ansible helm aws gcp azure linux nginx
    graphql rest grpc microservices
    git ci/cd jenkins github-actions
    pytest jest cypress playwright selenium
    html css sass tailwind
    pandas numpy pytorch tensorflow scikit-learn langchain langgraph
    machine-learning data-engineering observability opentelemetry prometheus grafana
    leadership mentoring communication agile scrum figma
    """.split()
)

# Real skills that are also everyday English words. Matching them by spelling would tag
# "ready to go" as the Go language; they are only ever taken from a recruiter's list.
AMBIGUOUS_SKILLS = frozenset({"go", "r", "c", "d", "less", "make", "spring", "rest", "express"})


# Characters that may not touch a skill on either side. A match must not start right
# after a letter or digit ("java" in "javascript"), nor end right before one, or before
# "+" or "#" ("c" in "c++"). Anything else — space, "/", ".", ",", a bracket — is a
# boundary, so "Python/Django", "HTML/CSS" and "React.js" each yield their skills.
def _word_char(c: str) -> bool:
    return "a" <= c <= "z" or "0" <= c <= "9"


def _ends_word(c: str) -> bool:
    return not (_word_char(c) or c in "+#")


_SEP = "\x00sep"  # trie edge for "-" in a skill name: matches one whitespace or hyphen
_END = "\x00end"  # trie key holding the skills whose spelling ends at this node


def _build_trie(vocabulary: Iterable[str]) -> dict:
    root: dict = {}
    for skill in sorted(set(vocabulary)):  # sorted: the same result in every process
        if not skill or skill in AMBIGUOUS_SKILLS:
            continue
        node = root
        for ch in skill:
            node = node.setdefault(_SEP if ch == "-" else ch, {})
        node.setdefault(_END, []).append(skill)
    return root


def find_skills(text: str, vocabulary: Iterable[str]) -> dict[str, int]:
    """Skills from the vocabulary that the text mentions, with a mention count.

    Matched as whole words or phrases, so "java" does not match "javascript"; symbols
    in names ("c++", "node.js", ".net") are taken literally; a hyphen in a skill name
    matches one space or hyphen, so "machine-learning" finds "machine learning".

    The rules are exactly those of the first version, which ran one regular expression
    per skill: (?<![a-z0-9])<skill>(?![a-z0-9+#]). That cost grew with vocabulary x
    text. Now every spelling sits in one character trie, walked from each position in
    the text that may start a match — one pass, however large the vocabulary. (A second
    version split the text into words instead; it broke "Python/Django" and counted a
    trailing skill several times. tests/test_content_analysis.py pins the rules down.)
    """
    root = _build_trie(vocabulary)
    if not root:
        return {}

    lowered = text.lower()
    n = len(lowered)
    found: dict[str, int] = {}
    resume_at: dict[str, int] = {}  # per skill, like re.findall: matches never overlap

    for i in range(n):
        if i > 0 and _word_char(lowered[i - 1]):
            continue
        stack = [(root, i)]
        while stack:
            node, j = stack.pop()
            if _END in node and (j == n or _ends_word(lowered[j])):
                for skill in node[_END]:
                    if i >= resume_at.get(skill, 0):
                        found[skill] = found.get(skill, 0) + 1
                        resume_at[skill] = j
            if j < n:
                c = lowered[j]
                if c in node:
                    stack.append((node[c], j + 1))
                if _SEP in node and (c == "-" or c.isspace()):
                    stack.append((node[_SEP], j + 1))
    return dict(sorted(found.items()))
