"""Declarative base and shared column mixins."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """All models inherit from this. Alembic reads Base.metadata to diff the schema."""


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
