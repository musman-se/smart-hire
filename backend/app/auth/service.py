"""Signing in, refreshing, signing out, changing a password, and the life of a staff
account: created, invited, deactivated, reactivated.

Candidates create their own accounts by registering (candidates.service.register_candidate).
Staff accounts are never self-service — an open "register as recruiter" would hand every
job and candidate to anyone who asked. The first admin is created from the command line
(app/auth/cli.py); after that, admins invite recruiters from the console
(recruiters.service), and each recruiter chooses their own password through the link.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.enums import STAFF_ROLES, Role
from app.auth.errors import (
    AccountDeactivatedError,
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidCurrentPasswordError,
    InvalidInvitationError,
    InvalidRefreshTokenError,
)
from app.auth.models import EMAIL_UNIQUE, Invitation, RefreshToken, User
from app.auth.schemas import (
    InvitationAccept,
    InvitationPreview,
    LoginRequest,
    PasswordChange,
    TokenPair,
)
from app.auth.security import (
    create_access_token,
    hash_invitation_token,
    hash_password,
    hash_refresh_token,
    new_invitation_token,
    new_refresh_token,
    verify_password,
)
from app.core.config import settings
from app.core.db import violated_constraint
from app.recruiters.models import Recruiter

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
    verified_hash = user.password_hash if user else None
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
    # Read again under the user's lock. An admin may have deactivated the account while
    # the password was hashing — deactivating deletes every refresh token, and one issued
    # after that would outlive it, working again the day the account is reactivated.
    # Deactivation locks the user too, so one of the two now waits for the other.
    # The password must also still be the one just checked: a password changed in the
    # meantime ended every session, and signing in with the old one — or saving an
    # upgraded hash of it — would undo that.
    user = await _lock_user(session, user.id)
    if user is None or user.password_hash != verified_hash:
        await session.rollback()
        raise InvalidCredentialsError()
    if not user.is_active:
        # Logged before the rollback, which expires every loaded attribute.
        logger.info("login_refused_deactivated user=%s", user.id)
        await session.rollback()
        raise AccountDeactivatedError()

    if upgraded_hash is not None:
        user.password_hash = upgraded_hash
    logger.info("login_succeeded user=%s role=%s", user.id, user.role)
    return await _issue_tokens(session, user)


async def _lock_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Serialise the token changes of one user. Every path that issues or ends a
    user's refresh tokens takes this lock, after the lock on the token it was given —
    one order everywhere, so no deadlock. Without it, a refresh committing while every
    session was being ended could slip a new token past the DELETE.

    FOR NO KEY UPDATE, so it does not block inserting refresh_tokens rows, whose
    foreign key takes a KEY SHARE lock on this same row.
    """
    return await session.get(
        User, user_id, with_for_update={"key_share": True}, populate_existing=True
    )


async def _end_every_session(session: AsyncSession, user_id: uuid.UUID) -> None:
    """The response to a stolen refresh token: delete every refresh token the user has.

    All of them, rotated ones included. Any token from before is then simply unknown:
    the stolen one cannot be replayed to end the user's *next* sessions, and neither can
    an old device's token. Marking them instead would keep each looking like a fresh
    theft, every time it was presented.

    The caller holds a lock on the one token it was given. That lock is released first,
    then every row is locked in lock_account's order: holding one token while waiting
    for the others could deadlock with a deactivation or a password change that took
    them in order. Nothing is lost in between — whatever happens, every token goes.
    """
    await session.rollback()
    await lock_account(session, user_id)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
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
    user = await _lock_user(session, stored.user_id)
    # A user deleted while the token was live takes the token with it (ON DELETE
    # CASCADE), and deactivating deletes them, so neither row would have been found.
    # Checked anyway.
    if user is None or not user.is_active:
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


async def change_password(session: AsyncSession, user: User, payload: PasswordChange) -> TokenPair:
    """Set a new password, end every session the user has, and start a new one for the
    device that asked, which is the pair returned.

    Every refresh token goes, not just the others': whoever made the change may not be
    the only one holding a session, and a password change is exactly when someone who
    suspects that wants them all ended. The caller swaps in the returned pair and stays
    signed in. Access tokens already handed out last until they expire, minutes at most,
    as after a sign-out.
    """
    # Both hashes are computed with no transaction open, as login does, so the slow part
    # never holds a pooled connection or a lock.
    verified_hash = user.password_hash
    await session.commit()
    valid, _ = await verify_password(payload.current_password.get_secret_value(), verified_hash)
    if not valid:
        logger.info("password_change_refused user=%s", user.id)
        raise InvalidCurrentPasswordError()
    new_hash = await hash_password(payload.new_password.get_secret_value())

    # The account's tokens before the user, as every path takes them: refresh and logout
    # lock a token, then the user, and the other way round here could deadlock with a
    # refresh in flight. See lock_account.
    locked = await lock_account(session, user.id)
    # Changed by another request while this one was hashing: the password it checked is
    # no longer the current one.
    if locked is None or locked.password_hash != verified_hash:
        await session.rollback()
        raise InvalidCurrentPasswordError()

    locked.password_hash = new_hash
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    logger.info("password_changed user=%s — every session ended", user.id)
    return await _issue_tokens(session, locked)


async def create_staff_account(
    session: AsyncSession,
    email: str,
    password: str,
    full_name: str,
    *,
    role: Role = Role.RECRUITER,
) -> User:
    """Create a staff account (a recruiter, or an admin) and its profile together, in one
    transaction, as register_candidate does for a candidate. Email, password and name
    must already be validated — see app/auth/cli.py."""
    if role not in STAFF_ROLES:
        raise ValueError(f"Not a staff role: {role}")
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=await hash_password(password),
        role=role,
    )
    # The relationship is what orders the INSERTs: users first.
    session.add(Recruiter(id=user.id, user=user, full_name=full_name))
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if violated_constraint(exc) != EMAIL_UNIQUE:
            raise
        raise DuplicateEmailError(f"An account with email {email} already exists.") from exc
    logger.info("staff_created user=%s role=%s", user.id, role)
    return user


# --- Invitations -------------------------------------------------------------------------


async def issue_invitation(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    issued_by: uuid.UUID,
    replace_existing: bool,
) -> tuple[str, datetime]:
    """A new invitation link for an account that has no password yet. Returns the raw
    token, which is shown once and never stored, and when it expires. The caller commits.

    replace_existing deletes the account's earlier link, so only the newest works. An
    account created in this same transaction has none, so it passes False. For one that
    already existed, the caller first takes lock_account and checks it still has no
    password.
    """
    if replace_existing:
        await session.execute(delete(Invitation).where(Invitation.user_id == user_id))
    raw = new_invitation_token()
    expires_at = datetime.now(UTC) + timedelta(hours=settings.invitation_ttl_hours)
    session.add(
        Invitation(
            user_id=user_id,
            token_hash=hash_invitation_token(raw),
            expires_at=expires_at,
            created_by=issued_by,
        )
    )
    return raw, expires_at


async def _find_invitation(
    session: AsyncSession, raw_token: str, *, lock: bool = False
) -> Invitation:
    query = select(Invitation).where(Invitation.token_hash == hash_invitation_token(raw_token))
    if lock:
        query = query.with_for_update()
    invitation = await session.scalar(query)
    if invitation is None or invitation.expires_at <= datetime.now(UTC):
        await session.rollback()
        raise InvalidInvitationError()
    return invitation


async def preview_invitation(session: AsyncSession, raw_token: str) -> InvitationPreview:
    """Whose invitation this is, so the page can greet them before they choose a password."""
    invitation = await _find_invitation(session, raw_token)
    recruiter = await session.get(Recruiter, invitation.user_id)
    await session.commit()
    # The same rule accept applies: a link is only for an active account with no
    # password yet. Deactivating and accepting delete links, so this is a backstop.
    if (
        recruiter is None
        or not recruiter.user.is_active
        or recruiter.user.password_hash is not None
    ):
        raise InvalidInvitationError()
    return InvitationPreview(
        email=recruiter.email, full_name=recruiter.full_name, expires_at=invitation.expires_at
    )


async def accept_invitation(session: AsyncSession, payload: InvitationAccept) -> TokenPair:
    """Set the invited account's password, use up the link, and sign them in.

    The link is checked before the slow hash, so a dead one fails fast without holding a
    connection through it — then checked again under a lock, so two tabs accepting the
    same link at once cannot both succeed. Locks follow the order every other path uses:
    the token's row first, then the user's.
    """
    await _find_invitation(session, payload.token)
    await session.commit()
    new_hash = await hash_password(payload.password.get_secret_value())

    invitation = await _find_invitation(session, payload.token, lock=True)
    user = await _lock_user(session, invitation.user_id)
    # A password already set means the link was used; a deactivated account deleted
    # its links, but is checked anyway.
    if user is None or not user.is_active or user.password_hash is not None:
        await session.rollback()
        raise InvalidInvitationError()

    user.password_hash = new_hash
    await session.execute(delete(Invitation).where(Invitation.user_id == user.id))
    logger.info("invitation_accepted user=%s", user.id)
    return await _issue_tokens(session, user)


# --- Deactivating ------------------------------------------------------------------------


async def lock_account(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Lock everything that gives one account access, before changing any of it.

    One order, the one every other path already follows — a token's row before its
    user's: the account's refresh tokens, then its invitations (each set by id, so two
    callers lock the same rows in the same order), then the user. A path that locked the
    user first and then deleted a token could deadlock with a refresh or an accepted
    invitation holding that token and waiting for the user.
    """
    await session.execute(
        select(RefreshToken.id)
        .where(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.id)
        .with_for_update()
    )
    await session.execute(
        select(Invitation.id)
        .where(Invitation.user_id == user_id)
        .order_by(Invitation.id)
        .with_for_update()
    )
    return await _lock_user(session, user_id)


async def deactivate_account(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Stop an account from signing in, and end everything it holds: every refresh token
    and every invitation link. Its access tokens stop at once too, because
    get_current_user refuses a deactivated account. The caller commits.

    None when there is no such account (deleted since the caller looked it up)."""
    user = await lock_account(session, user_id)
    if user is None:
        return None
    if user.deactivated_at is None:
        user.deactivated_at = datetime.now(UTC)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await session.execute(delete(Invitation).where(Invitation.user_id == user_id))
    logger.info("account_deactivated user=%s — every session ended", user_id)
    return user


async def reactivate_account(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Let a deactivated account sign in again with its old password. One that never set
    a password needs a new invitation. The caller commits. None when there is no such
    account."""
    user = await _lock_user(session, user_id)
    if user is None:
        return None
    user.deactivated_at = None
    logger.info("account_reactivated user=%s", user_id)
    return user
