"""Candidate model."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.applications.models import Application
    from app.skills.models import Skill


class Candidate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidates"

    # Unique at the database level, not just checked in Python. Two concurrent
    # registrations with the same address cannot both succeed.
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    headline: Mapped[str | None] = mapped_column(String(200))

    years_experience: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    resume_url: Mapped[str | None] = mapped_column(String(500))

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
        # The API lowercases emails before they reach the database, which is what makes
        # the unique constraint case-insensitive in practice. This makes the database
        # enforce it too: "Ayesha@x.com" cannot be written by any client, so it can never
        # sit beside "ayesha@x.com" as a second account.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
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

    def __repr__(self) -> str:
        return f"<Candidate {self.id} {self.email!r}>"
