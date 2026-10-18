"""Application model — the join between a candidate and a job.

This is its own table rather than a column on either side because the relationship
carries its own data: which stage it has reached, when it was submitted, the match score
Module 2 will compute. A foreign key has nowhere to put any of that.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Identity,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.applications.enums import ApplicationStage
from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.candidates.models import Candidate
    from app.jobs.models import Job


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
        #
        # Its index also serves every lookup by job_id alone, because job_id is its
        # leading column — which is why there is no separate index on job_id.
        UniqueConstraint("job_id", "candidate_id", name="uq_applications_job_candidate"),
        # Run on every single application: "how many active applications does this
        # candidate hold?" — WHERE candidate_id = ? AND stage NOT IN (...). Also serves
        # listing one candidate's applications, optionally by stage.
        Index("ix_applications_candidate_id_stage", "candidate_id", "stage"),
        # A recruiter opening a job: WHERE job_id = ? ORDER BY created_at DESC LIMIT 20.
        # During a hiring drive one job can hold thousands of applications; this reads
        # the newest 20 index entries instead of sorting all of them.
        Index("ix_applications_job_id_created_at", "job_id", "created_at"),
        # No index on stage by itself: six distinct values means any one stage is a
        # large slice of the table, and the planner rightly prefers a sequential scan.
    )

    def __repr__(self) -> str:
        return f"<Application {self.id} job={self.job_id} candidate={self.candidate_id}>"


class ApplicationStageChange(Base):
    """One move through the hiring pipeline. Append-only: rows are inserted, never
    updated or deleted, so together they are the application's history.

    `applications.stage` says where an application *is*; this table says how it got
    there and when — which is what "application tracking" means to a candidate, and
    what Module 3's analytics need for time-to-hire and stage conversion rates. Each
    row is written in the same transaction as the stage change it records, so the
    history can never disagree with the current stage.
    """

    __tablename__ = "application_stage_changes"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL for the first entry: an application comes from nowhere into APPLIED.
    from_stage: Mapped[ApplicationStage | None] = mapped_column(
        Enum(ApplicationStage, name="application_stage")
    )
    to_stage: Mapped[ApplicationStage] = mapped_column(
        Enum(ApplicationStage, name="application_stage"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __mapper_args__ = {"eager_defaults": True}
    __table_args__ = (
        # One application's history, in order — the only way this table is read.
        Index(
            "ix_application_stage_changes_application_id_changed_at",
            "application_id",
            "changed_at",
        ),
    )
