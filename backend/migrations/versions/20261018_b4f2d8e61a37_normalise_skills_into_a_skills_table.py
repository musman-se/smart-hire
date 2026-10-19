"""normalise skills into a skills table

Replaces the two array columns — jobs.required_skills and candidates.skills — with a
`skills` lookup table and two join tables, `job_skills` and `candidate_skills`.

This is a schema migration *and* a data migration. Autogenerate can only produce the
first half: it sees the columns disappear and the tables appear, but has no idea the rows
in one must become rows in the other. Left as generated, upgrading would silently delete
every skill in the database. The INSERT ... SELECT statements below are the hand-written
half that carries the data across.

The order inside upgrade() matters:
  1. create the new tables          (old columns still exist)
  2. copy the data across           (both exist — the only moment that is true)
  3. drop the old columns

downgrade() runs the same three steps the other way, rebuilding each array from the join
table, so nothing is lost in either direction.

Revision ID: b4f2d8e61a37
Revises: 7c1e5b2a9d40
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b4f2d8e61a37"
down_revision: str | Sequence[str] | None = "7c1e5b2a9d40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_join_table(name: str, owner_table: str, owner_column: str) -> None:
    op.create_table(
        name,
        sa.Column(owner_column, sa.UUID(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            [owner_column],
            [f"{owner_table}.id"],
            name=op.f(f"fk_{name}_{owner_column}_{owner_table}"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name=op.f(f"fk_{name}_skill_id_skills"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(owner_column, "skill_id", name=op.f(f"pk_{name}")),
    )
    op.create_index(f"ix_{name}_skill_id", name, ["skill_id"])


def upgrade() -> None:
    # --- 1. New tables ----------------------------------------------------------------
    op.create_table(
        "skills",
        sa.Column("id", sa.Integer(), sa.Identity(always=True), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "name = lower(btrim(name)) AND name <> ''",
            name=op.f("ck_skills_name_normalised"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_skills")),
        sa.UniqueConstraint("name", name=op.f("uq_skills_name")),
    )
    _create_join_table("job_skills", "jobs", "job_id")
    _create_join_table("candidate_skills", "candidates", "candidate_id")

    # --- 2. Data: arrays -> rows ------------------------------------------------------
    # Every distinct name from both arrays becomes one skills row. The API already
    # normalised these on the way in; lower/btrim/left repeat it so a row written by
    # hand cannot fail the check constraint and abort the migration halfway.
    op.execute(
        """
        INSERT INTO skills (name)
        SELECT DISTINCT left(lower(btrim(raw.name)), 64)
        FROM (
            SELECT unnest(required_skills) AS name FROM jobs
            UNION
            SELECT unnest(skills) AS name FROM candidates
        ) AS raw
        WHERE btrim(raw.name) <> ''
        ON CONFLICT (name) DO NOTHING
        """
    )
    # One join row per (job, skill) pair. LATERAL unnest turns each job's array into
    # rows alongside that job's id; DISTINCT guards against an array that repeated a name.
    op.execute(
        """
        INSERT INTO job_skills (job_id, skill_id)
        SELECT DISTINCT j.id, s.id
        FROM jobs AS j
        CROSS JOIN LATERAL unnest(j.required_skills) AS raw(name)
        JOIN skills AS s ON s.name = left(lower(btrim(raw.name)), 64)
        """
    )
    op.execute(
        """
        INSERT INTO candidate_skills (candidate_id, skill_id)
        SELECT DISTINCT c.id, s.id
        FROM candidates AS c
        CROSS JOIN LATERAL unnest(c.skills) AS raw(name)
        JOIN skills AS s ON s.name = left(lower(btrim(raw.name)), 64)
        """
    )

    # --- 3. Old columns, and the GIN indexes that served them -------------------------
    op.drop_index("ix_jobs_required_skills", table_name="jobs", postgresql_using="gin")
    op.drop_column("jobs", "required_skills")
    op.drop_index("ix_candidates_skills", table_name="candidates", postgresql_using="gin")
    op.drop_column("candidates", "skills")


def downgrade() -> None:
    # --- 1. Old columns back, empty ---------------------------------------------------
    op.add_column(
        "jobs",
        sa.Column(
            "required_skills",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "candidates",
        sa.Column(
            "skills",
            postgresql.ARRAY(sa.String()),
            server_default="{}",
            nullable=False,
        ),
    )

    # --- 2. Data: rows -> arrays ------------------------------------------------------
    op.execute(
        """
        UPDATE jobs AS j
        SET required_skills = ARRAY(
            SELECT s.name
            FROM job_skills AS js
            JOIN skills AS s ON s.id = js.skill_id
            WHERE js.job_id = j.id
            ORDER BY s.name
        )
        """
    )
    op.execute(
        """
        UPDATE candidates AS c
        SET skills = ARRAY(
            SELECT s.name
            FROM candidate_skills AS cs
            JOIN skills AS s ON s.id = cs.skill_id
            WHERE cs.candidate_id = c.id
            ORDER BY s.name
        )
        """
    )
    op.create_index(
        "ix_jobs_required_skills", "jobs", ["required_skills"], postgresql_using="gin"
    )
    op.create_index("ix_candidates_skills", "candidates", ["skills"], postgresql_using="gin")

    # --- 3. New tables ----------------------------------------------------------------
    op.drop_index("ix_candidate_skills_skill_id", table_name="candidate_skills")
    op.drop_table("candidate_skills")
    op.drop_index("ix_job_skills_skill_id", table_name="job_skills")
    op.drop_table("job_skills")
    op.drop_table("skills")
