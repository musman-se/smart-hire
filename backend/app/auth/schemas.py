"""Auth schemas.

Passwords are SecretStr throughout: printed, logged or put in an exception message, one
shows as "**********". The value is read only where it is hashed or verified.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator

from app.auth.enums import Role
from app.core.schemas import InputModel, ReadModel

# NIST SP 800-63B: at least 8 characters, and accept at least 64. The ceiling bounds the
# work one request can ask of the hasher.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class LoginRequest(InputModel):
    # Not EmailStr, and no length rule on the password: a sign-in is checked against what
    # is stored, not against today's registration rules.
    email: str = Field(min_length=3, max_length=320)
    password: SecretStr = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.strip().lower()


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


class UserRead(ReadModel):
    id: uuid.UUID = Field(description="For a candidate, also the id of their profile")
    email: str
    role: Role
    created_at: datetime
