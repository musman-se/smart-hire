"""Errors raised by the candidates domain."""

from app.core.errors import NotFoundError


class CandidateNotFoundError(NotFoundError):
    def __init__(self, candidate_id: object) -> None:
        super().__init__(f"Candidate {candidate_id} does not exist.")
