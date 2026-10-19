"""Application enumerations.

StrEnum means each member is a real `str`, so it serialises to JSON as its value with
no conversion step. Stored as a native PostgreSQL enum type — the database rejects an
invalid value rather than trusting the application to have checked.
"""

from enum import StrEnum


class ApplicationStage(StrEnum):
    """Where a candidate sits in the hiring pipeline.

    APPLIED is the initial stage every application starts in. HIRED, REJECTED and
    WITHDRAWN are terminal — they stop counting toward a candidate's active application
    limit, and nothing follows them.

    WITHDRAWN arrived in Module 2. Before it, withdrawing deleted the row, and with it
    every trace that the application had existed.
    """

    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"

    @classmethod
    def terminal(cls) -> set["ApplicationStage"]:
        return {cls.HIRED, cls.REJECTED, cls.WITHDRAWN}
