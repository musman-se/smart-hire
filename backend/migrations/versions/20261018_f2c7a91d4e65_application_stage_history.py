"""application stage history

Adds the WITHDRAWN stage and the append-only application_stage_changes table, and
backfills one history row for every existing application.

The backfill is honest about what it does not know: Module 1 kept no history, so each
existing application gets a single row — "arrived at its current stage" — dated at its
last update, with a note saying earlier moves were not recorded. Inventing the
intermediate steps would make the analytics built on this table lie.

downgrade() is lossy by necessity, and says so. Before this revision, withdrawing an
application deleted it; so a withdrawn application has no representation in the old
schema, and downgrading deletes it — exactly what withdrawing would have done then.

Revision ID: f2c7a91d4e65
Revises: c8b41f6e2d93
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f2c7a91d4e65"
down_revision: str | Sequence[str] | None = "c8b41f6e2d93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The existing type, referenced without creating it again.
application_stage = postgresql.ENUM(name="application_stage", create_type=False)


def upgrade() -> None:
    op.execute("ALTER TYPE application_stage ADD VALUE IF NOT EXISTS 'WITHDRAWN'")

    op.create_table(
        "application_stage_changes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("application_id", sa.UUID(), nullable=False),
        sa.Column("from_stage", application_stage, nullable=True),
        sa.Column("to_stage", application_stage, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["application_id"],
            ["applications.id"],
            name=op.f("fk_application_stage_changes_application_id_applications"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_application_stage_changes")),
    )
    op.create_index(
        "ix_application_stage_changes_application_id_changed_at",
        "application_stage_changes",
        ["application_id", "changed_at"],
    )

    op.execute(
        """
        INSERT INTO application_stage_changes (application_id, from_stage, to_stage, note, changed_at)
        SELECT id, NULL, stage,
               'Recorded when stage history was introduced; earlier moves were not tracked.',
               updated_at
        FROM applications
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_application_stage_changes_application_id_changed_at",
        table_name="application_stage_changes",
    )
    op.drop_table("application_stage_changes")

    op.execute("DELETE FROM applications WHERE stage = 'WITHDRAWN'")
    op.execute("ALTER TYPE application_stage RENAME TO application_stage_old")
    op.execute(
        "CREATE TYPE application_stage AS ENUM "
        "('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')"
    )
    op.execute(
        "ALTER TABLE applications ALTER COLUMN stage TYPE application_stage "
        "USING stage::text::application_stage"
    )
    op.execute("DROP TYPE application_stage_old")
