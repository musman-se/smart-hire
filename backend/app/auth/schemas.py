"""Auth schemas.

Passwords are SecretStr throughout: printed, logged or put in an exception message, one
shows as "**********". The value is read only where it is hashed or verified.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator

from app.auth.enums import Role
from app.core.schemas import InputModel, ReadModel

# NIST SP 800-63B: at least 8 characters, and accept at least 64. The ceiling bounds the
# work one request can ask of the hasher.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def normalise_email(value: str) -> str:
    """How every email is stored and looked up: trimmed and lowercase, so "Ayesha@x.com "
    and "ayesha@x.com" are one account. Registration, sign-in and invitations all use it,
    so the address someone is invited under is the one they sign in with."""
    return value.strip().lower()


# A password someone chooses — at registration, on a password change, or through an
# invitation. One rule for all three.
NewPassword = Annotated[
    SecretStr,
    Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description=f"{PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters",
    ),
]


class LoginRequest(InputModel):
    # Not EmailStr, and no length rule on the password: a sign-in is checked against what
    # is stored, not against today's registration rules.
    email: str = Field(min_length=3, max_length=320)
    password: SecretStr = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return normalise_email(value)


class PasswordChange(InputModel):
    # The current password, like a sign-in, is checked against what is stored, so it
    # carries no length rule. The new one follows registration's rules.
    current_password: SecretStr = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: NewPassword

    @model_validator(mode="after")
    def must_change(self) -> "PasswordChange":
        if self.new_password.get_secret_value() == self.current_password.get_secret_value():
            raise ValueError("The new password must differ from the current one.")
        return self


class RefreshRequest(InputModel):
    refresh_token: str = Field(min_length=1, max_length=200)


class TokenPair(BaseModel):
    """The shape of an OAuth 2.0 token response (RFC 6749 §5.1)."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Seconds until the access token expires")
    refresh_token: str = Field(
        description="Single use: exchange it at /auth/refresh for a new pair before it expires"
    )


class InvitationToken(InputModel):
    """The token from an invitation link. In the body, not the URL, so it stays out of
    server and proxy logs."""

    token: str = Field(min_length=1, max_length=200)


class InvitationAccept(InvitationToken):
    password: NewPassword


class InvitationPreview(BaseModel):
    """What the invitation page shows before the recruiter chooses a password."""

    email: str
    full_name: str
    expires_at: datetime


class UserRead(ReadModel):
    id: uuid.UUID = Field(description="For a candidate, also the id of their profile")
    email: str
    role: Role
    created_at: datetime
