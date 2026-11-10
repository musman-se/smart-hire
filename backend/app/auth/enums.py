"""Authentication enumerations. See app/applications/enums.py for why StrEnum."""

from enum import StrEnum


class Role(StrEnum):
    """What a user may do. One role per account.

    ADMIN does everything a recruiter does, and also manages the hiring team: sees every
    recruiter, invites new ones, and deactivates those who leave.
    RECRUITER runs the hiring side: jobs, publishing, every candidate and application.
    CANDIDATE owns one profile and their own applications, and sees published jobs.

    ADMIN is last on purpose: Postgres appends a new enum value at the end
    (migration 6b2d9e4f1a83), and create_all must build the same order.
    """

    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
    ADMIN = "admin"


def with_article(role: Role) -> str:
    """ "a recruiter", "an admin": for messages and help text that name a role."""
    return f"{'an' if role[0] in 'aeiou' else 'a'} {role}"


# The hiring team: both have a profile in `recruiters`, and both pass require_recruiter.
STAFF_ROLES = frozenset({Role.RECRUITER, Role.ADMIN})
