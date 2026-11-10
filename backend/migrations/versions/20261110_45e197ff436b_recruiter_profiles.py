"""recruiter profiles

Adds `recruiters`: a recruiter's profile, as `candidates` is a candidate's. Its primary
key is also a foreign key to users.id (the shared key of d5e8a2f41c07), so an account
has at most one recruiter profile and deleting the account deletes it.

The data step gives every existing recruiter account a profile, because from here on the
code expects one. full_name is required, and nobody has told us these names, so each is
made from the email's local part: "alice.ahmed@x.com" becomes "Alice Ahmed". The
recruiter corrects it with PATCH /recruiters/me. The profile is dated like the account.

downgrade() drops the table, and with it every name and title: users has nowhere to
keep them.

Revision ID: 45e197ff436b
Revises: 81276ef5beaf
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "45e197ff436b"
down_revision: str | Sequence[str] | None = "81276ef5beaf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recruiters",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["id"], ["users.id"], name=op.f("fk_recruiters_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recruiters")),
    )

    # Separators in the local part become spaces, and each word is capitalised. A local
    # part that is nothing but separators ("_@x.com") gets "Recruiter".
    op.execute(
        """
        INSERT INTO recruiters (id, full_name, created_at, updated_at)
        SELECT id,
               coalesce(
                   nullif(
                       initcap(btrim(translate(split_part(email, '@', 1), '._-+', '    '))),
                       ''
                   ),
                   'Recruiter'
               ),
               created_at,
               updated_at
        FROM users
        WHERE role = 'RECRUITER'
        """
    )


def downgrade() -> None:
    op.drop_table("recruiters")
