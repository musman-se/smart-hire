"""Candidate schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.job import _clean_skills


class CandidateBase(BaseModel):
    # EmailStr validates the address on the way in, so the unique constraint never has
    # to arbitrate between "bob@example.com" and "not an email".
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    headline: str | None = Field(default=None, max_length=200)
    years_experience: int = Field(default=0, ge=0, le=60)
    skills: list[str] = Field(default_factory=list)
    resume_url: str | None = Field(default=None, max_length=500)

    @field_validator("skills")
    @classmethod
    def normalise_skills(cls, value: list[str]) -> list[str]:
        return _clean_skills(value)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        # Stored lowercase so uniqueness is case-insensitive in practice.
        return value.strip().lower()


class CandidateCreate(CandidateBase):
    pass


class CandidateUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    headline: str | None = Field(default=None, max_length=200)
    years_experience: int | None = Field(default=None, ge=0, le=60)
    skills: list[str] | None = None
    resume_url: str | None = Field(default=None, max_length=500)

    # email is intentionally absent: it is the identity the unique constraint is built
    # on, and changing it belongs behind a verification flow, not a PATCH.

    @field_validator("skills")
    @classmethod
    def normalise_skills(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _clean_skills(value)


class CandidateRead(CandidateBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
