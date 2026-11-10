"""indexes and checks from the whole-app review

Indexes, for queries that had none:
- applications (stage, created_at) and (created_at): the recruiter's queue across all
  jobs — ORDER BY created_at DESC LIMIT n, with or without a stage filter. Both were a
  scan of the whole table and a sort.
- skills (name text_pattern_ops): the skill picker's prefix search, name LIKE 'py%',
  which the unique index cannot serve under the en_US collation.

Dropped: ix_job_extracted_skills_skill_id. Every read of that table is by job_id, and
skills are never deleted, so nothing used it; it only cost a write on every publish.

Checks, so every writer is held to what the API already enforces:
- applications.match_score is a percentage, 0 to 100, or not scored yet (NULL).
- candidates.full_name and recruiters.full_name have at least two characters once
  trimmed — no blank names in any list.

A row already outside a new check stops the upgrade and is named, rather than being
altered without asking (the rule 81276ef5beaf follows). The pre-check is skipped in
offline mode (`alembic upgrade --sql`), which has no database to read.

Written as MIGRATIONS.md §8 advises for live tables, so the API keeps serving while it
runs: each CHECK is added NOT VALID (a brief lock; new rows are checked from then on)
and validated afterwards under a lock that lets writes continue, and every index is
built or dropped CONCURRENTLY. CONCURRENTLY cannot run inside a transaction, and
VALIDATE only helps once the NOT VALID add has committed (until then its brief lock is
still held), so both run in an autocommit block — which means a failure can leave the
first steps committed. Every step is therefore safe to repeat: run the upgrade again.
(A failed concurrent build leaves an INVALID index behind; the DROP ... IF EXISTS before
each build clears it.)

Revision ID: 9c4f7d2e1b60
Revises: 6b2d9e4f1a83
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op

revision: str = "9c4f7d2e1b60"
down_revision: str | Sequence[str] | None = "6b2d9e4f1a83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCORE_RULE = "match_score IS NULL OR (match_score >= 0 AND match_score <= 100)"
NAME_RULE = "char_length(btrim(full_name)) >= 2"

# (table, constraint name as the models' naming convention spells it, rule)
CHECKS = [
    ("applications", "ck_applications_match_score_range", SCORE_RULE),
    ("candidates", "ck_candidates_full_name_not_blank", NAME_RULE),
    ("recruiters", "ck_recruiters_full_name_not_blank", NAME_RULE),
]

# (name, table, columns, postgresql_ops)
NEW_INDEXES = [
    ("ix_applications_stage_created_at", "applications", ["stage", "created_at"], None),
    ("ix_applications_created_at", "applications", ["created_at"], None),
    ("ix_skills_name_pattern", "skills", ["name"], {"name": "text_pattern_ops"}),
]
UNUSED_INDEX = ("ix_job_extracted_skills_skill_id", "job_extracted_skills", ["skill_id"])


def _refuse_rows_outside(table: str, rule: str, describe: str) -> None:
    if context.is_offline_mode():
        return
    offending = (
        op.get_bind()
        .execute(sa.text(f"SELECT id::text FROM {table} WHERE NOT ({rule}) ORDER BY id LIMIT 20"))
        .scalars()
        .all()
    )
    if offending:
        listed = "\n".join(f"  {row_id}" for row_id in offending)
        raise RuntimeError(
            f"{table}: these rows break the new rule ({describe}). "
            f"Fix them, then upgrade again:\n{listed}"
        )


def upgrade() -> None:
    _refuse_rows_outside("applications", SCORE_RULE, "match_score between 0 and 100")
    _refuse_rows_outside("candidates", NAME_RULE, "a name of at least two characters")
    _refuse_rows_outside("recruiters", NAME_RULE, "a name of at least two characters")

    # In the revision's transaction: each table is locked only for an instant.
    for table, name, rule in CHECKS:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({rule}) NOT VALID")

    with op.get_context().autocommit_block():
        for table, name, _ in CHECKS:
            op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")
        for name, table, columns, ops in NEW_INDEXES:
            op.drop_index(name, table_name=table, if_exists=True, postgresql_concurrently=True)
            op.create_index(
                name, table, columns, postgresql_ops=ops or {}, postgresql_concurrently=True
            )
        name, table, _ = UNUSED_INDEX
        op.drop_index(name, table_name=table, if_exists=True, postgresql_concurrently=True)


def downgrade() -> None:
    for table, name, _ in reversed(CHECKS):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")

    with op.get_context().autocommit_block():
        name, table, columns = UNUSED_INDEX
        op.drop_index(name, table_name=table, if_exists=True, postgresql_concurrently=True)
        op.create_index(name, table, columns, postgresql_concurrently=True)
        for name, table, _, _ in reversed(NEW_INDEXES):
            op.drop_index(name, table_name=table, if_exists=True, postgresql_concurrently=True)
