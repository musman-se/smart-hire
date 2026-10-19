"""Application enumerations.

StrEnum means each member is a real `str`, so it serialises to JSON as its value with
no conversion step. Stored as a native PostgreSQL enum type — the database rejects an
invalid value rather than trusting the application to have checked.
"""

from enum import StrEnum


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
