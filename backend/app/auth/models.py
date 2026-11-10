"""User accounts, refresh tokens and invitations."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.auth.enums import Role
from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

# The unique index behind one account per email. A violation of it — and only of it —
# means "that email is taken"; services check the name before saying so.
EMAIL_UNIQUE = "uq_users_email"


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """An account: who someone is when they sign in, how they prove it, and their role.

    Everything else about a person lives on their profile: `candidates` for a candidate,
    `recruiters` for a recruiter or an admin. A profile's primary key *is* this row's id
    — see Candidate.id — so the email is stored once, here, and "is this application
    mine?" is one comparison.
    """

    __tablename__ = "users"

    # The sign-in name. Unique, and lowercase by constraint, as candidates.email was
    # before it moved here: "Ayesha@x.com" cannot become a second account.
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)

    # An Argon2id hash in PHC format: "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>",
    # about 100 characters. 255 leaves room for stronger parameters or another algorithm.
    # NULL means the account cannot sign in: the candidates who registered before
    # accounts existed got one without a password (migration d5e8a2f41c07), and so does
    # a recruiter an admin invited, until they accept the invitation and choose one.
    password_hash: Mapped[str | None] = mapped_column(String(255))

    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), nullable=False)

    # Set when an admin deactivates the account: it can no longer sign in, and its
    # sessions end. Deactivated rather than deleted, so the person's name stays on what
    # they did. NULL is active.
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (CheckConstraint("email = lower(email)", name="email_lowercase"),)

    @property
    def is_active(self) -> bool:
        return self.deactivated_at is None

    def __repr__(self) -> str:
        return f"<User {self.id} {self.role}>"


class Invitation(Base, UUIDPrimaryKeyMixin):
    """A one-time link an admin hands a new recruiter, who opens it to set a password.

    Like a refresh token, only a SHA-256 of the token is stored, and the token is 256
    random bits. Accepting deletes every invitation of that account, and so does
    deactivating it; issuing a new one deletes the old. So a row means "this link still
    works until expires_at".
    """

    __tablename__ = "invitations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # The admin who issued it. Kept if that admin's account is later removed.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Every invitation of one account is found, and deleted, by user_id.
        Index("ix_invitations_user_id", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<Invitation {self.id} user={self.user_id}>"


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
    # Set when the token is exchanged for the next one. Kept rather than deleted, so a
    # second use of the same token is recognised as reuse — see auth.service.refresh.
    # Signing out deletes the row instead.
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
