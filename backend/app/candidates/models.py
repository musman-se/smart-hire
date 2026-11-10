"""Candidate model."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import Base, TimestampMixin
from app.core.names import FULL_NAME_MAX_LENGTH, FULL_NAME_NOT_BLANK

if TYPE_CHECKING:
    from app.applications.models import Application
    from app.auth.models import User
    from app.skills.models import Skill


class Candidate(Base, TimestampMixin):
    __tablename__ = "candidates"

    # The primary key is also a foreign key: a candidate's id *is* their account's id.
    # That makes the relationship one-to-one by construction — a second profile for one
    # account would repeat the primary key — and needs no extra column or index.
    # Deleting the account deletes the profile, and with it every application.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    full_name: Mapped[str] = mapped_column(String(FULL_NAME_MAX_LENGTH), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    headline: Mapped[str | None] = mapped_column(String(200))

    years_experience: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    resume_url: Mapped[str | None] = mapped_column(String(500))

    # Many-to-one, so lazy="joined": the account comes back in the same SELECT as the
    # profile, as an INNER JOIN because every candidate has one. The email the API
    # shows is the account's — stored once, on users.
    user: Mapped["User"] = relationship(lazy="joined", innerjoin=True)

    applications: Mapped[list["Application"]] = relationship(
        back_populates="candidate",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Through the candidate_skills join table. See Job.skill_set for why selectin.
    skill_set: Mapped[list["Skill"]] = relationship(
        secondary="candidate_skills",
        lazy="selectin",
        order_by="Skill.name",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint("years_experience >= 0", name="years_experience_non_negative"),
        # The API trims a name and requires two characters; this holds every writer to
        # the same, so no list shows a blank name.
        CheckConstraint(FULL_NAME_NOT_BLANK, name="full_name_not_blank"),
        # Default listing order, newest first.
        Index("ix_candidates_created_at", "created_at"),
        # Name search is ILIKE '%term%' — see ix_jobs_title_trgm.
        Index(
            "ix_candidates_full_name_trgm",
            "full_name",
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        ),
    )

    @property
    def skills(self) -> list[str]:
        """Skill names, which is what the API exposes — CandidateRead reads this."""
        return [skill.name for skill in self.skill_set]

    @property
    def email(self) -> str:
        """The account's email — CandidateRead reads this, and notifications use it."""
        return self.user.email

    def __repr__(self) -> str:
        return f"<Candidate {self.id} {self.full_name!r}>"
