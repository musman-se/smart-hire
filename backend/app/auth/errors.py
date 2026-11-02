"""Errors raised by the auth domain.

Every 401 here says as little as it can. "Wrong password" and "no such account" are one
error, and so are a forged token, an expired one and one for a deleted user: each
distinction a client could branch on is one an attacker could probe for.
"""

from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError


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


class RoleRequiredError(ForbiddenError):
    def __init__(self, role: str) -> None:
        super().__init__(f"Only a {role} can do this.")
