"""job text length checks

Until now only the API bounded a job's text: 3-200 characters of title, 10-20,000 of
description. Any other writer (a script, a psql or pgAdmin session, a future service)
could store a one-letter title or a megabyte of description. Two CHECK constraints now
hold every writer to the same numbers.

The columns keep their types. `description` stays `text`, whose limit is now the
constraint: raising it later is a drop-and-add of the constraint, with no column
rewrite. `title` is already varchar(200), so its constraint adds only the minimum.

The numbers are written out here rather than imported from app.jobs.models. A migration
records what the schema became at this point in history; if the constants change, a new
revision changes the constraint.

A row already outside the bounds stops the upgrade, naming the jobs to fix. Shortening
or padding a recruiter's text without asking would be worse than stopping.

Revision ID: 81276ef5beaf
Revises: d5e8a2f41c07
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op

revision: str = "81276ef5beaf"
down_revision: str | Sequence[str] | None = "d5e8a2f41c07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TITLE_RULE = "char_length(title) >= 3"
DESCRIPTION_RULE = "char_length(description) BETWEEN 10 AND 20000"


def upgrade() -> None:
    # Offline (`alembic upgrade --sql`) there is no database to read: emit the DDL only.
    if context.is_offline_mode():
        op.create_check_constraint(op.f("ck_jobs_title_length"), "jobs", TITLE_RULE)
        op.create_check_constraint(op.f("ck_jobs_description_length"), "jobs", DESCRIPTION_RULE)
        return
    offending = (
        op.get_bind()
        .execute(
            sa.text(
                f"SELECT id, char_length(title), char_length(description) FROM jobs "
                f"WHERE NOT ({TITLE_RULE}) OR NOT ({DESCRIPTION_RULE}) ORDER BY id"
            )
        )
        .all()
    )
    if offending:
        listed = "\n".join(
            f"  {job_id}: title {title} chars, description {description} chars"
            for job_id, title, description in offending
        )
        raise RuntimeError(
            f"{len(offending)} job(s) are outside the new text bounds (title at least 3 "
            f"characters, description 10 to 20,000). Fix them, then upgrade again:\n{listed}"
        )

    op.create_check_constraint(op.f("ck_jobs_title_length"), "jobs", TITLE_RULE)
    op.create_check_constraint(op.f("ck_jobs_description_length"), "jobs", DESCRIPTION_RULE)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_jobs_description_length"), "jobs", type_="check")
    op.drop_constraint(op.f("ck_jobs_title_length"), "jobs", type_="check")
