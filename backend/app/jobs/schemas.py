"""Job schemas — what crosses the API boundary.

Deliberately separate from app.jobs.models. The model has columns a client must never
set (status, published_at) and the API has validation the database does not express
(at least one non-blank skill). The text bounds live in the model, which enforces them
too; they are checked here first so a client gets a 422 rather than a 500.
"""

import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.core.schemas import InputModel, PatchModel, ReadModel
from app.jobs.enums import EmploymentType, JobStatus
from app.jobs.models import (
    DESCRIPTION_MAX_LENGTH,
    DESCRIPTION_MIN_LENGTH,
    TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
)
from app.skills.schemas import normalise_skill_names

MAX_APPLICATIONS_CEILING = 100_000


class JobBase(InputModel):
    title: str = Field(min_length=TITLE_MIN_LENGTH, max_length=TITLE_MAX_LENGTH)
    description: str = Field(min_length=DESCRIPTION_MIN_LENGTH)
    department: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    required_skills: list[str] = Field(default_factory=list)
    min_experience_years: int = Field(default=0, ge=0, le=50)
    max_applications: int | None = Field(default=None, gt=0)

    @field_validator("required_skills")
    @classmethod
    def normalise_skills(cls, value: list[str]) -> list[str]:
        return normalise_skill_names(value)


class JobCreate(JobBase):
    """Note the absence of `status`. A job is always created as a draft — letting a
    client post status="published" would skip the publishing transition entirely."""

    # The caps apply to input only. JobRead shares JobBase, and it must keep reading
    # every row already stored — including any saved before these limits existed.
    description: str = Field(min_length=DESCRIPTION_MIN_LENGTH, max_length=DESCRIPTION_MAX_LENGTH)
    max_applications: int | None = Field(default=None, gt=0, le=MAX_APPLICATIONS_CEILING)


class JobUpdate(PatchModel):
    """Every field optional: this backs PATCH, where omitted means "leave unchanged".

    `model_dump(exclude_unset=True)` in the service distinguishes "not sent" from
    "explicitly set to null" — a distinction a plain default of None would destroy.
    Null is accepted only where the column allows it; see PatchModel.
    """

    not_nullable = frozenset(
        {"title", "description", "employment_type", "required_skills", "min_experience_years"}
    )

    title: str | None = Field(
        default=None, min_length=TITLE_MIN_LENGTH, max_length=TITLE_MAX_LENGTH
    )
    description: str | None = Field(
        default=None, min_length=DESCRIPTION_MIN_LENGTH, max_length=DESCRIPTION_MAX_LENGTH
    )
    department: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType | None = None
    required_skills: list[str] | None = None
    min_experience_years: int | None = Field(default=None, ge=0, le=50)
    max_applications: int | None = Field(default=None, gt=0, le=MAX_APPLICATIONS_CEILING)

    @field_validator("required_skills")
    @classmethod
    def normalise_skills(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else normalise_skill_names(value)


class JobRead(JobBase, ReadModel):
    id: uuid.UUID
    status: JobStatus
    published_at: datetime | None
    publish_error: str | None = Field(
        default=None, description="Why the last publish failed; cleared on success"
    )
    content_processed_at: datetime | None = Field(
        default=None, description="When the publishing workflow last analysed the text"
    )
    created_at: datetime
    updated_at: datetime
