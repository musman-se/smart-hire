"""adopt constraint naming convention

The initial schema was created before Base.metadata had a naming convention, so Postgres
named six constraints itself (jobs_pkey, candidates_email_key, ...). The models now
declare a convention, and this revision renames those six to match it — otherwise every
future autogenerate would see the names differ and propose dropping and recreating them.

Renames only: no table is rewritten and no data moves. Renaming a primary-key or unique
constraint also renames the index behind it, in the same statement.

Revision ID: 7c1e5b2a9d40
Revises: 3858efc9fb3f
Create Date: 2026-10-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "7c1e5b2a9d40"
down_revision: str | Sequence[str] | None = "3858efc9fb3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, name Postgres chose, name the convention produces)
RENAMES = [
    ("jobs", "jobs_pkey", "pk_jobs"),
    ("candidates", "candidates_pkey", "pk_candidates"),
    ("applications", "applications_pkey", "pk_applications"),
    ("candidates", "candidates_email_key", "uq_candidates_email"),
    ("applications", "applications_job_id_fkey", "fk_applications_job_id_jobs"),
    (
        "applications",
        "applications_candidate_id_fkey",
        "fk_applications_candidate_id_candidates",
    ),
]


def upgrade() -> None:
    for table, old, new in RENAMES:
        op.execute(f"ALTER TABLE {table} RENAME CONSTRAINT {old} TO {new}")


def downgrade() -> None:
    for table, old, new in reversed(RENAMES):
        op.execute(f"ALTER TABLE {table} RENAME CONSTRAINT {new} TO {old}")
