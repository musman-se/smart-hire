"""Recruiter model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.auth.enums import Role
from app.core.models import Base, TimestampMixin
from app.recruiters.enums import StaffStatus

if TYPE_CHECKING:
    from app.auth.models import User

FULL_NAME_MAX_LENGTH = 160
TITLE_MAX_LENGTH = 100


class Recruiter(Base, TimestampMixin):
    """A staff member's profile — a recruiter's, or an admin's — who they are, as
    colleagues and candidates see them.

    The account (email, password, role) is the `users` row with the same id. This is the
    same shape as Candidate: the primary key is also a foreign key to users.id, so one
    account has at most one recruiter profile, and deleting the account deletes it.
    """

    __tablename__ = "recruiters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    full_name: Mapped[str] = mapped_column(String(FULL_NAME_MAX_LENGTH), nullable=False)
    # Their own role at the company, e.g. "Talent Partner". Not a job they hire for.
    title: Mapped[str | None] = mapped_column(String(TITLE_MAX_LENGTH))

    # Joined into the same SELECT, as on Candidate: every recruiter has an account, and
    # the email the API shows is the account's.
    user: Mapped["User"] = relationship(lazy="joined", innerjoin=True)

    @property
    def email(self) -> str:
        """The account's email — RecruiterRead reads this."""
        return self.user.email

    @property
    def role(self) -> Role:
        """recruiter or admin: both have a profile here."""
        return self.user.role

    @property
    def deactivated_at(self) -> datetime | None:
        return self.user.deactivated_at

    @property
    def status(self) -> StaffStatus:
        if self.user.deactivated_at is not None:
            return StaffStatus.DEACTIVATED
        if self.user.password_hash is None:
            return StaffStatus.INVITED
        return StaffStatus.ACTIVE

    def __repr__(self) -> str:
        return f"<Recruiter {self.id} {self.full_name!r}>"
