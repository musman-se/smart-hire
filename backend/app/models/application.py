"""Application model — the join between a candidate and a job.

This is its own table rather than a column on either side because the relationship
carries its own data: which stage it has reached, when it was submitted, the match score
Module 2 will compute. A foreign key has nowhere to put any of that.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, Float, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ApplicationStage
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.job import Job


class Application(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "applications"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )

    stage: Mapped[ApplicationStage] = mapped_column(
        Enum(ApplicationStage, name="application_stage"),
        nullable=False,
        default=ApplicationStage.APPLIED,
    )

    cover_letter: Mapped[str | None] = mapped_column(Text)

    # Populated by the scoring worker in a later module. NULL means "not scored yet",
    # which is why it is nullable rather than defaulting to 0.0.
    match_score: Mapped[float | None] = mapped_column(Float)

    job: Mapped["Job"] = relationship(back_populates="applications")
    candidate: Mapped["Candidate"] = relationship(back_populates="applications")

    __table_args__ = (
        # The rule "a candidate may not apply to the same job twice", enforced by the
        # database. Application-level checks cannot hold this under concurrency: two
        # simultaneous requests can both read "no existing application" before either
        # writes. Only the constraint is authoritative.
        UniqueConstraint("job_id", "candidate_id", name="uq_applications_job_candidate"),
        Index("ix_applications_job_id", "job_id"),
        Index("ix_applications_candidate_id", "candidate_id"),
        Index("ix_applications_stage", "stage"),
    )

    def __repr__(self) -> str:
        return f"<Application {self.id} job={self.job_id} candidate={self.candidate_id}>"
