"""Signing in, refreshing, signing out, and creating recruiter accounts.

Candidates create their own accounts by registering (candidates.service.register_candidate).
Recruiter accounts are never self-service — an open "register as recruiter" would hand
every job and candidate to anyone who asked. They are created from the command line
(app/auth/cli.py).
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.enums import Role
from app.auth.errors import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
)
from app.auth.models import RefreshToken, User
from app.auth.schemas import LoginRequest, TokenPair
from app.auth.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


async def _issue_tokens(session: AsyncSession, user: User) -> TokenPair:
    """A new access token and a new refresh token, committed with whatever the caller
    changed in this transaction — for a refresh, the revocation of the old token."""
    raw = new_refresh_token()
    now = datetime.now(UTC)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw),
            expires_at=now + timedelta(days=settings.refresh_token_days),
        )
    )
    await session.commit()
    return TokenPair(
        access_token=create_access_token(user.id, now=now),
        expires_in=settings.access_token_minutes * 60,
        refresh_token=raw,
    )


async def login(session: AsyncSession, payload: LoginRequest) -> TokenPair:
    user = await session.scalar(select(User).where(User.email == payload.email))
    # Verified even when there is no such user — see verify_password for why.
    valid, upgraded_hash = await verify_password(
        payload.password.get_secret_value(), user.password_hash if user else None
    )
    if user is None or not valid:
        # No email in the log: a failed sign-in is often a typo'd address, which is
        # still personal data.
        logger.info("login_failed")
        raise InvalidCredentialsError()

    if upgraded_hash is not None:
        user.password_hash = upgraded_hash
    logger.info("login_succeeded user=%s role=%s", user.id, user.role)
    return await _issue_tokens(session, user)


async def refresh(session: AsyncSession, raw_token: str) -> TokenPair:
    """Exchange a refresh token for a new pair. Each refresh token works once.

    Rotation is what makes a stolen refresh token detectable. The thief and the owner
    both hold it; whichever uses it second presents a token that is already revoked.
    The server cannot tell which of them is which, so it revokes every session the user
    has: the thief is locked out, and the owner simply signs in again.
    """
    # Locked, so two refreshes racing with one token are applied one after the other:
    # the second sees the first's revocation, rather than both issuing new pairs.
    stored = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .with_for_update()
    )
    now = datetime.now(UTC)

    if stored is None:
        raise InvalidRefreshTokenError()

    if stored.revoked_at is not None:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await session.commit()
        logger.warning("refresh_token_reused user=%s — every session revoked", stored.user_id)
        raise InvalidRefreshTokenError()

    if stored.expires_at <= now:
        await session.rollback()
        raise InvalidRefreshTokenError()

    stored.revoked_at = now
    user = await session.get(User, stored.user_id)
    # A user deleted while the token was live takes the token with it (ON DELETE
    # CASCADE), so the row above would not have been found. Checked anyway.
    if user is None:
        await session.rollback()
        raise InvalidRefreshTokenError()
    return await _issue_tokens(session, user)


async def logout(session: AsyncSession, raw_token: str) -> None:
    """Revoke one refresh token. Unknown or already-revoked tokens are not an error:
    signing out twice is still signed out, and the answer reveals nothing either way.

    The access token stays valid until it expires — minutes, by design. Revoking those
    too would mean a database lookup of every token on every request.
    """
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_refresh_token(raw_token),
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()


async def create_recruiter(session: AsyncSession, email: str, password: str) -> User:
    """Email and password must already be validated — see app/auth/cli.py."""
    user = User(email=email, password_hash=await hash_password(password), role=Role.RECRUITER)
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateEmailError(f"An account with email {email} already exists.") from exc
    logger.info("recruiter_created user=%s", user.id)
    return user
