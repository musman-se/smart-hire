"""Authentication enumerations. See app/applications/enums.py for why StrEnum."""

from enum import StrEnum


class Role(StrEnum):
    """What a user may do. One role per account.

    RECRUITER runs the hiring side: jobs, publishing, every candidate and application.
    CANDIDATE owns one profile and their own applications, and sees published jobs.
    """

    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
