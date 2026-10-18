"""Job posting model."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.jobs.enums import EmploymentType, JobStatus

if TYPE_CHECKING:
    from app.applications.models import Application
    from app.skills.models import Skill


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

    # Required skills, through the job_skills join table (see app/skills/models.py).
    # lazy="selectin" loads them for every job in a result with one extra
    # `WHERE job_id IN (...)` query — never one query per job — and, because it happens
    # during the original await, nothing tries to lazy-load later. Under async SQLAlchemy
    # a lazy load outside an await raises rather than silently querying.
    skill_set: Mapped[list["Skill"]] = relationship(
        secondary="job_skills",
        lazy="selectin",
        order_by="Skill.name",
        passive_deletes=True,
    )

    __table_args__ = (
        # Named without the "ck_jobs_" prefix: the naming convention adds it.
        CheckConstraint("min_experience_years >= 0", name="min_experience_non_negative"),
        CheckConstraint(
            "max_applications IS NULL OR max_applications > 0",
            name="max_applications_positive",
        ),
        # Recruiters browse by status constantly; this is the hottest filter in the API.
        Index("ix_jobs_status", "status"),
        Index("ix_jobs_title", "title"),
    )

    @property
    def required_skills(self) -> list[str]:
        """Skill names, which is what the API exposes — JobRead reads this attribute."""
        return [skill.name for skill in self.skill_set]

    def __repr__(self) -> str:
        return f"<Job {self.id} {self.title!r} {self.status}>"
