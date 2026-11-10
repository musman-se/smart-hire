"""Candidate schemas."""

import uuid
from datetime import datetime
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, EmailStr, Field, field_validator

from app.auth.schemas import NewPassword, normalise_email
from app.core.schemas import FullName, InputModel, PatchModel, ReadModel
from app.skills.schemas import SkillList


def _web_address(value: str) -> str:
    """Only http(s), with a host. Recruiters click this link: a javascript:, data: or
    custom-scheme value has no business in it, and text with no scheme would become a
    link relative to the console."""
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError("Use a full web address starting with http:// or https://")
    return value


ResumeUrl = Annotated[str, Field(max_length=500), AfterValidator(_web_address)]


class CandidateBase(InputModel):
    # EmailStr validates the address on the way in, so the unique constraint never has
    # to arbitrate between "bob@example.com" and "not an email". It is the account's
    # email: stored on users, read back through Candidate.email.
    email: EmailStr
    full_name: FullName
    phone: str | None = Field(default=None, max_length=32)
    headline: str | None = Field(default=None, max_length=200)
    years_experience: int = Field(default=0, ge=0, le=60)
    skills: SkillList = Field(default_factory=list)
    resume_url: ResumeUrl | None = None

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        # Stored lowercase so uniqueness is case-insensitive in practice.
        return normalise_email(value)


class CandidateRegistration(CandidateBase):
    """A new account and its profile, in one request (POST /auth/register)."""

    password: NewPassword


class CandidateUpdate(PatchModel):
    not_nullable = frozenset({"full_name", "years_experience", "skills"})

    full_name: FullName | None = None
    phone: str | None = Field(default=None, max_length=32)
    headline: str | None = Field(default=None, max_length=200)
    years_experience: int | None = Field(default=None, ge=0, le=60)
    skills: SkillList | None = None
    resume_url: ResumeUrl | None = None

    # email is intentionally absent: it is the identity the unique constraint is built
    # on, and changing it belongs behind a verification flow, not a PATCH.


class CandidateRead(ReadModel):
    """What the API returns. Deliberately not the input schema: today's input rules
    (email syntax, the 60-year cap, the name and link rules) must not be re-applied to
    rows already stored, or one row saved before a rule existed would turn every list
    that includes it into a 500."""

    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    headline: str | None
    years_experience: int
    skills: list[str]
    resume_url: str | None
    created_at: datetime
    updated_at: datetime
