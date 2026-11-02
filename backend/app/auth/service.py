"""Signing in, refreshing, signing out, and creating recruiter accounts.

Candidates create their own accounts by registering (candidates.service.register_candidate).
Recruiter accounts are never self-service — an open "register as recruiter" would hand
every job and candidate to anyone who asked. They are created from the command line
(app/auth/cli.py).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
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
    # End the read before the slow part. The transaction would otherwise hold a pooled
    # connection through the hash, and a burst of sign-ins could take every connection
    # the API has. `user` stays usable: sessions here do not expire objects on commit.
    await session.commit()
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


async def _end_every_session(session: AsyncSession, user_id: uuid.UUID) -> None:
    """The response to a stolen refresh token: delete every live one the user has.

    Deleted, not marked: `revoked_at` must keep meaning "rotated". Marked, the tokens
    ended here would later look like rotated ones, and each old device presenting its
    token would end the user's *new* sessions all over again.
    """
    await session.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    await session.commit()
    logger.warning("refresh_token_reused user=%s — every session ended", user_id)


def _rotated_just_now(token: RefreshToken, now: datetime) -> bool:
    """Rotated within the grace period. Its own client presenting it again — a retry
    after a lost response, or a page reloaded while its refresh was in flight — is not
    a theft, and ending every session for it would punish the owner."""
    assert token.revoked_at is not None
    return now - token.revoked_at <= timedelta(seconds=settings.refresh_reuse_grace_seconds)


async def refresh(session: AsyncSession, raw_token: str) -> TokenPair:
    """Exchange a refresh token for a new pair. Each refresh token works once.

    Rotation is what makes a stolen refresh token detectable. The thief and the owner
    both hold it; whichever uses it second presents a token that is already rotated.
    The server cannot tell which of them is which, so it ends every session the user
    has: the thief is locked out, and the owner simply signs in again.

    Only a token *rotated* longer ago than REFRESH_REUSE_GRACE_SECONDS counts as reuse.
    Within that window, a second presentation is just refused. Signed-out and ended
    tokens are deleted, so they are simply unknown. An expired token is refused before
    the reuse check: it could not have been used by anyone anyway.
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

    if stored.expires_at <= now:
        await session.rollback()
        raise InvalidRefreshTokenError()

    if stored.revoked_at is not None:
        if _rotated_just_now(stored, now):
            await session.rollback()
        else:
            await _end_every_session(session, stored.user_id)
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
    """End a session by deleting its refresh token. Unknown tokens are not an error:
    signing out twice is still signed out, and the answer reveals nothing either way.

    Deleted, not marked revoked: a revoked row means "rotated", and presenting one is
    treated as theft (see refresh). A token from a tab that signed out is not stolen.

    Signing out with a token that was rotated outside the grace period means someone
    else rotated it — and holds the live session it became. That is reuse, answered as
    refresh answers it: every session ends, the thief's included.

    The access token stays valid until it expires — minutes, by design. Revoking those
    too would mean a database lookup of every token on every request.
    """
    stored = await session.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .with_for_update()
    )
    if stored is None:
        await session.rollback()
        return
    if stored.revoked_at is None:
        await session.delete(stored)
        await session.commit()
    elif _rotated_just_now(stored, datetime.now(UTC)):
        await session.rollback()
    else:
        await _end_every_session(session, stored.user_id)


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
