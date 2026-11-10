"""Errors raised by the auth domain.

Every 401 here says as little as it can. "Wrong password" and "no such account" are one
error, and so are a forged token, an expired one and one for a deleted user: each
distinction a client could branch on is one an attacker could probe for.
"""

from app.auth.enums import Role, with_article
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError


class DuplicateEmailError(ConflictError):
    """Registering an email that already has an account. This one cannot be vague: the
    person registering needs to know to sign in instead."""

    code = "duplicate_email"


class NotAuthenticatedError(UnauthorizedError):
    def __init__(self) -> None:
        super().__init__("Sign in first: send Authorization: Bearer <access token>.")


class InvalidTokenError(UnauthorizedError):
    """Present but unusable. The client should refresh, then sign in again if that fails."""

    code = "invalid_token"
    headers = {"WWW-Authenticate": 'Bearer error="invalid_token"'}

    def __init__(self) -> None:
        super().__init__("The access token is invalid or has expired.")


class InvalidCredentialsError(UnauthorizedError):
    code = "invalid_credentials"

    def __init__(self) -> None:
        super().__init__("The email or password is incorrect.")


class InvalidRefreshTokenError(UnauthorizedError):
    code = "invalid_refresh_token"

    def __init__(self) -> None:
        super().__init__("The refresh token is invalid, expired or already used. Sign in again.")


class InvalidCurrentPasswordError(ForbiddenError):
    """Changing a password with the wrong current one. A 403, not a 401: the access
    token is fine, and a 401 tells the console to refresh it and then sign out."""

    code = "invalid_current_password"

    def __init__(self) -> None:
        super().__init__("The current password is incorrect.")


class AccountDeactivatedError(ForbiddenError):
    """The password was right, but an admin has deactivated the account. Said only after
    the password is proved, so it reveals nothing to someone guessing emails."""

    code = "account_deactivated"

    def __init__(self) -> None:
        super().__init__("This account has been deactivated. Ask your admin to reactivate it.")


class InvalidInvitationError(NotFoundError):
    """Unknown, expired or already used — one answer for all three, as for tokens."""

    code = "invalid_invitation"

    def __init__(self) -> None:
        super().__init__(
            "This invitation link is invalid, expired or already used. "
            "Ask your admin for a new one."
        )


class RoleRequiredError(ForbiddenError):
    def __init__(self, role: Role) -> None:
        super().__init__(f"Only {with_article(role)} can do this.")
