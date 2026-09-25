"""Job schemas — what crosses the API boundary.

Deliberately separate from app.models.job. The model has columns a client must never
set (status, published_at) and the API has validation the database does not express
(title length, at least one non-blank skill).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import EmploymentType, JobStatus


def _clean_skills(value: list[str]) -> list[str]:
    """Trim, drop blanks, lowercase, de-duplicate — order preserved."""
    seen: dict[str, None] = {}
    for raw in value:
        skill = raw.strip().lower()
        if skill:
            seen.setdefault(skill, None)
    return list(seen)


class JobBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10)
    department: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    required_skills: list[str] = Field(default_factory=list)
    min_experience_years: int = Field(default=0, ge=0, le=50)
    max_applications: int | None = Field(default=None, gt=0)

    @field_validator("required_skills")
    @classmethod
    def normalise_skills(cls, value: list[str]) -> list[str]:
        return _clean_skills(value)


class JobCreate(JobBase):
    """Note the absence of `status`. A job is always created as a draft — letting a
    client post status="published" would skip the publishing transition entirely."""


class JobUpdate(BaseModel):
    """Every field optional: this backs PATCH, where omitted means "leave unchanged".

    `model_dump(exclude_unset=True)` in the service distinguishes "not sent" from
    "explicitly set to null" — a distinction a plain default of None would destroy.
    """

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10)
    department: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType | None = None
    required_skills: list[str] | None = None
    min_experience_years: int | None = Field(default=None, ge=0, le=50)
    max_applications: int | None = Field(default=None, gt=0)

    @field_validator("required_skills")
    @classmethod
    def normalise_skills(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _clean_skills(value)


class JobRead(JobBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: JobStatus
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
