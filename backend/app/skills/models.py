"""Skills — stored once each, and linked to jobs and candidates through join tables.

Module 1 stored skills as a Postgres array on each row: jobs.required_skills and
candidates.skills. That broke first normal form (a column holding a list, not a single
value) and caused the problems normalisation exists to prevent:

- **Update anomaly.** Renaming "postgres" to "postgresql" meant rewriting every array
  that contained it, on two tables, and missing one silently split the vocabulary.
- **No single vocabulary.** Nothing listed which skills exist, so there was nothing to
  autocomplete against and nothing for the Module 2 extractor to match a description to.
- **No room for facts about the link.** "Required vs nice-to-have", or a candidate's
  years with one skill, belong to the job-skill pair — an array element has nowhere to
  put them.

Now each skill is one row in `skills`, and `job_skills` / `candidate_skills` record which
job requires, and which candidate has, which skill. Each fact is stored exactly once.
"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Table,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base
from app.skills.schemas import SKILL_NAME_MAX_LENGTH


class Skill(Base):
    """One row per distinct skill name.

    A lookup table, so it gets a compact integer key rather than a UUID: it is joined on
    constantly and exposes nothing sensitive, which is what the UUIDs on jobs and
    candidates protect against.
    """

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(SKILL_NAME_MAX_LENGTH), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The API normalises names before they get here. This makes the database refuse
        # "Python" or " python" from any other writer too, so the unique constraint on
        # name really does mean one row per skill.
        CheckConstraint("name = lower(btrim(name)) AND name <> ''", name="name_normalised"),
    )

    def __repr__(self) -> str:
        return f"<Skill {self.id} {self.name!r}>"


# Join tables. Plain Tables rather than mapped classes: today the link carries no data of
# its own, so it needs no class. The composite primary key is also the duplicate guard —
# a job cannot list the same skill twice.
#
# The primary key (job_id, skill_id) serves lookups by job_id, its leading column. The
# reverse question — "which jobs need kafka?" — starts from skill_id, which needs its own
# index.
job_skills = Table(
    "job_skills",
    Base.metadata,
    Column(
        "job_id",
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "skill_id",
        Integer,
        ForeignKey("skills.id", ondelete="RESTRICT"),
        primary_key=True,
    ),
    Index("ix_job_skills_skill_id", "skill_id"),
)

candidate_skills = Table(
    "candidate_skills",
    Base.metadata,
    Column(
        "candidate_id",
        UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "skill_id",
        Integer,
        ForeignKey("skills.id", ondelete="RESTRICT"),
        primary_key=True,
    ),
    Index("ix_candidate_skills_skill_id", "skill_id"),
)
