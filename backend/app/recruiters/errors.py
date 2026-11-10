"""Errors raised by the recruiters domain."""

from app.core.errors import ConflictError, NotFoundError


class RecruiterNotFoundError(NotFoundError):
    def __init__(self, recruiter_id: object) -> None:
        super().__init__(f"Recruiter {recruiter_id} has no profile.")


class CannotDeactivateSelfError(ConflictError):
    """An admin deactivating their own account could leave the team with no admin, and
    nobody to undo it."""

    code = "cannot_deactivate_self"

    def __init__(self) -> None:
        super().__init__("You cannot deactivate your own account.")


class InvitationNotAllowedError(ConflictError):
    """A new invitation link is only for an active account that has no password yet."""

    code = "invitation_not_allowed"
