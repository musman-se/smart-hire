"""Recruiter schemas."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints, field_validator

from app.auth.enums import Role
from app.auth.schemas import normalise_email
from app.core.schemas import FullName, InputModel, PatchModel, ReadModel, normalise_full_name
from app.recruiters.enums import StaffStatus
from app.recruiters.models import TITLE_MAX_LENGTH

# normalise_full_name is re-exported for the CLI, which applies the same rule to a name
# typed at the command line.
__all__ = ["FullName", "normalise_full_name"]


def _blank_is_none(value: str) -> str | None:
    # An emptied title field means "no title", not a title of "". Already trimmed.
    return value or None


Title = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=TITLE_MAX_LENGTH),
    AfterValidator(_blank_is_none),
]


class RecruiterUpdate(PatchModel):
    not_nullable = frozenset({"full_name"})

    full_name: FullName | None = None
    title: Title | None = None

    # email is absent for the same reason as on CandidateUpdate: it is the account's
    # identity, and changing it belongs behind a verification flow.


class RecruiterInvite(InputModel):
    """An admin adding a recruiter (POST /recruiters). No password: the recruiter chooses
    one through the invitation link."""

    email: EmailStr
    full_name: FullName
    title: Title | None = None

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return normalise_email(value)


class RecruiterRead(ReadModel):
    id: uuid.UUID = Field(description="Also the id of the recruiter's account")
    email: str
    full_name: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class StaffMemberRead(RecruiterRead):
    """One row of the admin's team page."""

    role: Role = Field(description="recruiter or admin")
    status: StaffStatus = Field(
        description="active; invited (has not set a password yet); or deactivated"
    )
    deactivated_at: datetime | None
    invitation_expires_at: datetime | None = Field(
        default=None, description="When the current invitation link stops working, if any"
    )


class InvitationIssued(BaseModel):
    """Shown once. The console turns the token into a link; the server keeps only a hash."""

    token: str
    expires_at: datetime


class RecruiterInvited(BaseModel):
    member: StaffMemberRead
    invitation: InvitationIssued
