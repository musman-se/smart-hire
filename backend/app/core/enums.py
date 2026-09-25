"""Domain enumerations.

StrEnum means each member is a real `str`, so it serialises to JSON as its value with
no conversion step. These are stored as native PostgreSQL enum types — the database
rejects an invalid value rather than trusting the application to have checked.
"""

from enum import StrEnum


class JobStatus(StrEnum):
    """Lifecycle of a job posting.

    Module 2 replaces the direct draft -> published transition with a Temporal workflow
    that passes through PROCESSING while skills are extracted.
    """

    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class EmploymentType(StrEnum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"


class ApplicationStage(StrEnum):
    """Where a candidate sits in the hiring pipeline.

    APPLIED is the initial stage every application starts in. REJECTED and HIRED are
    terminal — they stop counting toward a candidate's active application limit.
    """

    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"

    @classmethod
    def terminal(cls) -> set["ApplicationStage"]:
        return {cls.HIRED, cls.REJECTED}
