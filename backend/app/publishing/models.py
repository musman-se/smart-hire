"""Structured job content — what the publishing workflow extracts from a description.

A description is free text written for people. Search, ranking and (in Module 4) the
semantic layer need it as data, so publishing breaks it down and stores the parts:

- job_sections          the description split into summary, responsibilities,
                        requirements and benefits, one row per item, in order
- job_keywords          the terms that characterise the job, each with a weight
- job_extracted_skills  skills from the shared vocabulary that the text mentions

All three are *derived* data: they can be rebuilt from the description at any time,
and the workflow does exactly that on every run — delete the job's rows, insert the new
ones, in one transaction. That replace-all shape is what makes a retried or repeated
run safe: running it twice leaves the same rows as running it once.

Extracted skills are kept apart from job_skills on purpose. job_skills is what the
recruiter *requires*, and eligibility is checked against it; extracted skills are what
the text *mentions*, an observation used for search and ranking. Merging the two would
let a passing mention of "kafka" start rejecting candidates.
"""

import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Enum,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base
from app.publishing.enums import SectionKind


class JobSection(Base):
    """One item of a broken-down description — a responsibility, a requirement..."""

    __tablename__ = "job_sections"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[SectionKind] = mapped_column(
        Enum(SectionKind, name="job_section_kind"), nullable=False
    )
    # Order within the kind, from 0. Lists in a description are ordered on purpose.
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        # Also the index for "all sections of this job": job_id is its leading column.
        UniqueConstraint("job_id", "kind", "position", name="uq_job_sections_job_kind_position"),
        CheckConstraint("position >= 0", name="position_non_negative"),
    )


class JobKeyword(Base):
    """A term that characterises a job, weighted 0..1 relative to the job's top term."""

    __tablename__ = "job_keywords"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True
    )
    keyword: Mapped[str] = mapped_column(String(64), primary_key=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (CheckConstraint("score > 0 AND score <= 1", name="score_in_range"),)


job_extracted_skills = Table(
    "job_extracted_skills",
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
    # How many times the text mentions the skill — a rough signal of its weight.
    Column("mentions", Integer, nullable=False),
    CheckConstraint("mentions > 0", name="mentions_positive"),
    Index("ix_job_extracted_skills_skill_id", "skill_id"),
)
