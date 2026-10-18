"""rework indexes around query patterns

Module 1 indexed columns one at a time. This revision indexes the queries the services
actually run instead. The reasoning for each index sits beside it in the models; in short:

  dropped  ix_jobs_status                 replaced by (status, created_at): filter + sort
  dropped  ix_jobs_title                  a B-tree cannot serve ILIKE '%term%'
  dropped  ix_applications_job_id         duplicate of the unique (job_id, candidate_id)
  dropped  ix_applications_candidate_id   replaced by (candidate_id, stage)
  dropped  ix_applications_stage          six values: too unselective to be used
  added    ix_jobs_status_created_at, ix_jobs_created_at, ix_jobs_title_trgm
  added    ix_candidates_created_at, ix_candidates_full_name_trgm
  added    ix_applications_candidate_id_stage, ix_applications_job_id_created_at
  added    ck_candidates_email_lowercase

A note for production: CREATE INDEX locks the table against writes while it builds. On a
large live table you would use CREATE INDEX CONCURRENTLY instead, which cannot run inside
a transaction — in Alembic, inside `with op.get_context().autocommit_block():`. At this
project's size the plain form takes milliseconds, so it stays transactional: if any step
fails, the whole revision rolls back.

Revision ID: e91a6c3f0b58
Revises: b4f2d8e61a37
Create Date: 2026-10-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e91a6c3f0b58"
down_revision: str | Sequence[str] | None = "b4f2d8e61a37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Trigram operator classes. Trusted since Postgres 13, so the database owner may
    # create it without being a superuser.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # --- jobs -------------------------------------------------------------------------
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_title", table_name="jobs")
    op.create_index("ix_jobs_status_created_at", "jobs", ["status", "created_at"])
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])
    op.create_index(
        "ix_jobs_title_trgm",
        "jobs",
        ["title"],
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )

    # --- candidates -------------------------------------------------------------------
    op.create_index("ix_candidates_created_at", "candidates", ["created_at"])
    op.create_index(
        "ix_candidates_full_name_trgm",
        "candidates",
        ["full_name"],
        postgresql_using="gin",
        postgresql_ops={"full_name": "gin_trgm_ops"},
    )
    # Lowercase anything written outside the API before the constraint can refuse it.
    # If two rows differ only by case this UPDATE hits the unique constraint and the
    # migration stops — correctly, since that is a duplicate account a human must merge.
    op.execute("UPDATE candidates SET email = lower(email) WHERE email <> lower(email)")
    op.create_check_constraint(
        op.f("ck_candidates_email_lowercase"), "candidates", "email = lower(email)"
    )

    # --- applications -----------------------------------------------------------------
    op.drop_index("ix_applications_job_id", table_name="applications")
    op.drop_index("ix_applications_candidate_id", table_name="applications")
    op.drop_index("ix_applications_stage", table_name="applications")
    op.create_index(
        "ix_applications_candidate_id_stage", "applications", ["candidate_id", "stage"]
    )
    op.create_index(
        "ix_applications_job_id_created_at", "applications", ["job_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_applications_job_id_created_at", table_name="applications")
    op.drop_index("ix_applications_candidate_id_stage", table_name="applications")
    op.create_index("ix_applications_stage", "applications", ["stage"])
    op.create_index("ix_applications_candidate_id", "applications", ["candidate_id"])
    op.create_index("ix_applications_job_id", "applications", ["job_id"])

    # op.f() marks the name as final. Without it Alembic applies the naming convention
    # a second time and looks for "ck_candidates_ck_candidates_email_lowercase".
    op.drop_constraint(op.f("ck_candidates_email_lowercase"), "candidates", type_="check")
    op.drop_index("ix_candidates_full_name_trgm", table_name="candidates")
    op.drop_index("ix_candidates_created_at", table_name="candidates")

    op.drop_index("ix_jobs_title_trgm", table_name="jobs")
    op.drop_index("ix_jobs_created_at", table_name="jobs")
    op.drop_index("ix_jobs_status_created_at", table_name="jobs")
    op.create_index("ix_jobs_title", "jobs", ["title"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    # pg_trgm is left installed: other objects may depend on it, and an unused
    # extension costs nothing.
