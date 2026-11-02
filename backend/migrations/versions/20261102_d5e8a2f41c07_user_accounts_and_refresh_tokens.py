"""user accounts and refresh tokens

Adds `users` and `refresh_tokens`, and makes every candidate profile belong to an
account: candidates.id becomes a foreign key to users.id, and the email moves from
candidates to users, so it is stored once.

The data step runs between the two halves. The foreign key cannot be added while
candidates exist with no account, so each existing candidate first gets one — with
**the same id**, their email, and **no password**. Inventing a password would be worse
than useless: nobody would know it. A NULL password_hash is an account that cannot
sign in; a password-reset flow is the way such a candidate would claim it.

downgrade() moves the email back and drops the accounts. Recruiter accounts and every
password are lost: the old schema has nowhere to keep them.

Revision ID: d5e8a2f41c07
Revises: b7e3d05a9c12
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e8a2f41c07"
down_revision: str | Sequence[str] | None = "b7e3d05a9c12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role", sa.Enum("RECRUITER", "CANDIDATE", name="user_role"), nullable=False),
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
        sa.CheckConstraint("email = lower(email)", name=op.f("ck_users_email_lowercase")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    # Data: one password-less account per existing candidate, sharing its id. The
    # emails are already unique and lowercase — candidates enforced both — so this
    # cannot trip either constraint on users. The account is dated like the profile.
    op.execute(
        """
        INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
        SELECT id, email, NULL, 'CANDIDATE', created_at, updated_at FROM candidates
        """
    )

    op.create_foreign_key(
        op.f("fk_candidates_id_users"),
        "candidates",
        "users",
        ["id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(op.f("ck_candidates_email_lowercase"), "candidates", type_="check")
    op.drop_constraint(op.f("uq_candidates_email"), "candidates", type_="unique")
    op.drop_column("candidates", "email")


def downgrade() -> None:
    # Nullable first, filled from the accounts, then made NOT NULL — the reverse of the
    # upgrade's order, for the same reason.
    op.add_column("candidates", sa.Column("email", sa.String(length=320), nullable=True))
    op.execute("UPDATE candidates SET email = users.email FROM users WHERE users.id = candidates.id")
    op.alter_column("candidates", "email", nullable=False)
    op.create_unique_constraint(op.f("uq_candidates_email"), "candidates", ["email"])
    op.create_check_constraint(
        op.f("ck_candidates_email_lowercase"), "candidates", "email = lower(email)"
    )
    op.drop_constraint(op.f("fk_candidates_id_users"), "candidates", type_="foreignkey")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    # drop_table leaves the enum type behind; the next upgrade would collide with it.
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=False)
