"""Candidate model."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Index, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.application import Application


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

    skills: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        nullable=False,
        default=list,
        server_default="{}",
    )

    resume_url: Mapped[str | None] = mapped_column(String(500))

    applications: Mapped[list["Application"]] = relationship(
        back_populates="candidate",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "years_experience >= 0", name="ck_candidates_years_experience_non_negative"
        ),
        Index("ix_candidates_skills", "skills", postgresql_using="gin"),
    )

    def __repr__(self) -> str:
        return f"<Candidate {self.id} {self.email!r}>"
