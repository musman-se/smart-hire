"""job content tables

The structured content the publishing workflow extracts from a description:
job_sections, job_keywords and job_extracted_skills. See app/publishing/models.py.

Revision ID: c8b41f6e2d93
Revises: a3d9e7c15b20
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8b41f6e2d93"
down_revision: str | Sequence[str] | None = "a3d9e7c15b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "job_sections",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "SUMMARY", "RESPONSIBILITY", "REQUIREMENT", "BENEFIT", name="job_section_kind"
            ),
            nullable=False,
        ),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.CheckConstraint("position >= 0", name=op.f("ck_job_sections_position_non_negative")),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name=op.f("fk_job_sections_job_id_jobs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_job_sections")),
        sa.UniqueConstraint(
            "job_id", "kind", "position", name=op.f("uq_job_sections_job_kind_position")
        ),
    )

    op.create_table(
        "job_keywords",
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("keyword", sa.String(length=64), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.CheckConstraint(
            "score > 0 AND score <= 1", name=op.f("ck_job_keywords_score_in_range")
        ),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name=op.f("fk_job_keywords_job_id_jobs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("job_id", "keyword", name=op.f("pk_job_keywords")),
    )

    op.create_table(
        "job_extracted_skills",
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("mentions", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "mentions > 0", name=op.f("ck_job_extracted_skills_mentions_positive")
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
            name=op.f("fk_job_extracted_skills_job_id_jobs"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name=op.f("fk_job_extracted_skills_skill_id_skills"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("job_id", "skill_id", name=op.f("pk_job_extracted_skills")),
    )
    op.create_index(
        "ix_job_extracted_skills_skill_id", "job_extracted_skills", ["skill_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_job_extracted_skills_skill_id", table_name="job_extracted_skills")
    op.drop_table("job_extracted_skills")
    op.drop_table("job_keywords")
    op.drop_table("job_sections")
    # create_table made this type implicitly; nothing drops it implicitly. The lesson of
    # the initial revision's downgrade — see docs/MIGRATIONS.md §7.1.
    op.execute("DROP TYPE IF EXISTS job_section_kind")
