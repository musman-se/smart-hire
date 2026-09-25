"""Job posting model."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EmploymentType, JobStatus
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.application import Application


class Job(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "jobs"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    department: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(120))

    employment_type: Mapped[EmploymentType] = mapped_column(
        Enum(EmploymentType, name="employment_type"),
        nullable=False,
        default=EmploymentType.FULL_TIME,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"),
        nullable=False,
        default=JobStatus.DRAFT,
    )

    # Postgres array rather than a join table: skills are a flat list read as a whole and
    # never referenced independently. A GIN index below keeps containment queries fast.
    required_skills: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        nullable=False,
        default=list,
        server_default="{}",
    )

    min_experience_years: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Optional cap on how many applications this job accepts. NULL means uncapped.
    max_applications: Mapped[int | None] = mapped_column(Integer)

    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    applications: Mapped[list["Application"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint("min_experience_years >= 0", name="ck_jobs_min_experience_non_negative"),
        CheckConstraint(
            "max_applications IS NULL OR max_applications > 0",
            name="ck_jobs_max_applications_positive",
        ),
        # Recruiters browse by status constantly; this is the hottest filter in the API.
        Index("ix_jobs_status", "status"),
        Index("ix_jobs_title", "title"),
        Index("ix_jobs_required_skills", "required_skills", postgresql_using="gin"),
    )

    def __repr__(self) -> str:
        return f"<Job {self.id} {self.title!r} {self.status}>"
