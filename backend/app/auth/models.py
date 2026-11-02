"""User accounts and refresh tokens."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.auth.enums import Role
from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """An account: the credentials, and nothing else.

    Everything else about a person lives on their profile. A candidate's profile is the
    `candidates` row whose primary key *is* this row's id — see Candidate.id — so the
    email is stored once, here, and "is this application mine?" is one comparison.
    """

    __tablename__ = "users"

    # The sign-in name. Unique, and lowercase by constraint, as candidates.email was
    # before it moved here: "Ayesha@x.com" cannot become a second account.
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)

    # An Argon2id hash in PHC format: "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>",
    # about 100 characters. 255 leaves room for stronger parameters or another algorithm.
    # NULL means the account cannot sign in: the candidates who registered before
    # accounts existed got one without a password (migration d5e8a2f41c07).
    password_hash: Mapped[str | None] = mapped_column(String(255))

    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), nullable=False)

    __table_args__ = (CheckConstraint("email = lower(email)", name="email_lowercase"),)

    def __repr__(self) -> str:
        return f"<User {self.id} {self.role}>"


class RefreshToken(Base, UUIDPrimaryKeyMixin):
    """One refresh token. Each is used once: refreshing revokes it and issues the next.

    Only a hash of the token is stored. Someone who reads this table — a backup, a
    leaked dump — holds nothing they can present to /auth/refresh.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SHA-256 in hex: always 64 characters. Unique, and that unique index is the lookup
    # every refresh makes.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set when the token is used or the user signs out. Kept rather than deleted, so a
    # second use of the same token is recognised as reuse — see auth.service.refresh.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Revoking every session of one user, and the ON DELETE CASCADE from users, both
        # find rows by user_id. Without this index each would scan the whole table.
        Index("ix_refresh_tokens_user_id", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<RefreshToken {self.id} user={self.user_id}>"
