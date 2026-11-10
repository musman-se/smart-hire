"""Errors raised by the recruiters domain."""

from app.core.errors import NotFoundError


class RecruiterNotFoundError(NotFoundError):
    def __init__(self, recruiter_id: object) -> None:
        super().__init__(f"Recruiter {recruiter_id} has no profile.")
