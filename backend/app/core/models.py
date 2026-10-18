"""Declarative base and shared column mixins."""

import uuid
from datetime import datetime

from sqlalchemy import DDL, DateTime, MetaData, event, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Every constraint and index gets a predictable name. Without this, Postgres invents
# names (jobs_pkey, candidates_email_key, applications_job_id_fkey) and a migration that
# later needs to drop one has to guess what the server called it. Alembic's own docs
# recommend setting this before the first migration; this project adopted it in
# revision 7c1e5b2a9d40, which renames the constraints created before it.
NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "ix": "ix_%(column_0_label)s",
}


class Base(DeclarativeBase):
    """All models inherit from this. Alembic reads Base.metadata to diff the schema."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# pg_trgm provides the trigram operator classes behind the title and name search indexes.
# Migrations create it explicitly; this listener covers metadata.create_all(), which the
# test suite uses, so the models stay self-sufficient.
event.listen(
    Base.metadata, "before_create", DDL("CREATE EXTENSION IF NOT EXISTS pg_trgm")
)


class UUIDPrimaryKeyMixin:
    """UUID primary keys rather than sequential integers.

    Sequential ids leak business information — /jobs/1 and /jobs/2 tell a competitor how
    many jobs exist, and let anyone walk the whole table by incrementing. The id is
    generated in Python so the object has one before it reaches the database.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """created_at / updated_at maintained by the database, not the application.

    server_default and onupdate mean the values are correct even for a write that did not
    come through this codebase — a migration, or a psql session.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
