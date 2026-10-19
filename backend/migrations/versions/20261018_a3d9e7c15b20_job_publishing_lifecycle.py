"""job publishing lifecycle

Adds the two states the publishing workflow needs — PROCESSING while it runs,
PUBLISH_FAILED when it gives up — and the two columns it reports through.

Written by hand: autogenerate does not see values added to an existing Postgres enum.

Postgres can add a value to an enum (ALTER TYPE ... ADD VALUE) but can never remove one.
So downgrade() cannot simply reverse upgrade(): it moves any job in a new state back to
DRAFT, builds a fresh type without the new values, switches the column over to it, and
drops the old type.

Revision ID: a3d9e7c15b20
Revises: e91a6c3f0b58
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3d9e7c15b20"
down_revision: str | Sequence[str] | None = "e91a6c3f0b58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLAlchemy stores enum members by NAME, so the database values are upper case.
    # The new values cannot be used until this transaction commits — env.py runs each
    # revision in its own transaction for exactly that reason.
    op.execute("ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'PROCESSING' AFTER 'DRAFT'")
    op.execute(
        "ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'PUBLISH_FAILED' AFTER 'PUBLISHED'"
    )

    op.add_column("jobs", sa.Column("publish_error", sa.Text(), nullable=True))
    op.add_column(
        "jobs", sa.Column("content_processed_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("jobs", "content_processed_at")
    op.drop_column("jobs", "publish_error")

    # Jobs mid-publish or failed have no state to return to but DRAFT.
    op.execute("UPDATE jobs SET status = 'DRAFT' WHERE status IN ('PROCESSING', 'PUBLISH_FAILED')")
    op.execute("ALTER TYPE job_status RENAME TO job_status_old")
    op.execute("CREATE TYPE job_status AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED')")
    # The cast goes through text: there is no direct cast between two enum types. Indexes
    # on the column (ix_jobs_status_created_at) are rebuilt automatically.
    op.execute(
        "ALTER TABLE jobs ALTER COLUMN status TYPE job_status USING status::text::job_status"
    )
    op.execute("DROP TYPE job_status_old")
