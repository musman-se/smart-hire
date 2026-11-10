"""Recruiter schemas."""

import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.core.schemas import PatchModel, ReadModel
from app.recruiters.models import FULL_NAME_MAX_LENGTH, TITLE_MAX_LENGTH

FULL_NAME_MIN_LENGTH = 2


def normalise_full_name(value: str) -> str:
    """Trimmed, and at least FULL_NAME_MIN_LENGTH characters once trimmed. The CLI uses
    this too, so a name typed at the command line follows the API's rule."""
    value = value.strip()
    if not FULL_NAME_MIN_LENGTH <= len(value) <= FULL_NAME_MAX_LENGTH:
        raise ValueError(
            f"The name must be {FULL_NAME_MIN_LENGTH} to {FULL_NAME_MAX_LENGTH} characters."
        )
    return value


class RecruiterUpdate(PatchModel):
    not_nullable = frozenset({"full_name"})

    full_name: str | None = Field(default=None, max_length=FULL_NAME_MAX_LENGTH)
    title: str | None = Field(default=None, max_length=TITLE_MAX_LENGTH)

    # email is absent for the same reason as on CandidateUpdate: it is the account's
    # identity, and changing it belongs behind a verification flow.

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        return None if value is None else normalise_full_name(value)

    @field_validator("title")
    @classmethod
    def blank_title_is_none(cls, value: str | None) -> str | None:
        # An emptied title field means "no title", not a title of "".
        return (value.strip() or None) if value is not None else None


class RecruiterRead(ReadModel):
    id: uuid.UUID = Field(description="Also the id of the recruiter's account")
    email: str
    full_name: str
    title: str | None
    created_at: datetime
    updated_at: datetime
