"""admin role, invitations and deactivation

Three changes that let a company run its own hiring team from the console:

- `user_role` gains ADMIN. An admin does everything a recruiter does, and also lists,
  invites, deactivates and reactivates recruiters.
- `users.deactivated_at`: set when an admin deactivates someone. They can no longer sign
  in, but their account and profile stay, so their name stays on what they did.
- `invitations`: one-time links an admin hands a new recruiter, who opens one to choose
  their own password. Only a SHA-256 of each token is stored, as for refresh tokens.

Nothing existing changes meaning: every account stays active, and every role keeps its
value. There is no data step — the first admin is created afterwards, with
`python -m app.auth.cli create-admin`.

ALTER TYPE ... ADD VALUE runs inside this revision's transaction (Postgres 12 and later
allow it), but the new value cannot be used until that transaction commits. Nothing
here uses it.

downgrade() cannot just drop the value: Postgres has no ALTER TYPE ... DROP VALUE. It
turns admins back into recruiters, then rebuilds the type without ADMIN. Invitations
and deactivations are lost — deactivated accounts become able to sign in again.

Revision ID: 6b2d9e4f1a83
Revises: 45e197ff436b
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6b2d9e4f1a83"
down_revision: str | Sequence[str] | None = "45e197ff436b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN'")

    op.add_column("users", sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_invitations_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_invitations_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_invitations_token_hash")),
    )
    op.create_index("ix_invitations_user_id", "invitations", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_invitations_user_id", table_name="invitations")
    op.drop_table("invitations")
    op.drop_column("users", "deactivated_at")

    # Rebuild user_role without ADMIN: admins become recruiters, the column moves to a
    # new type with the old two values, and the old type is dropped.
    op.execute("UPDATE users SET role = 'RECRUITER' WHERE role = 'ADMIN'")
    op.execute("ALTER TYPE user_role RENAME TO user_role_with_admin")
    op.execute("CREATE TYPE user_role AS ENUM ('RECRUITER', 'CANDIDATE')")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role"
    )
    op.execute("DROP TYPE user_role_with_admin")
