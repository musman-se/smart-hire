"""Recruiter business logic: a staff member's own profile, and the admin's team.

Staff accounts come into being two ways. The first admin is created from the command
line (app/auth/cli.py), because nobody exists yet who could invite them. After that an
admin invites recruiters here: the account and profile are created with no password,
and the recruiter chooses one through the invitation link (auth.service.accept_invitation).
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service as auth_service
from app.auth.enums import Role
from app.auth.errors import AccountDeactivatedError, DuplicateEmailError
from app.auth.models import EMAIL_UNIQUE, Invitation, User
from app.core.db import violated_constraint
from app.recruiters.enums import StaffStatus
from app.recruiters.errors import (
    CannotDeactivateSelfError,
    InvitationNotAllowedError,
    RecruiterNotFoundError,
)
from app.recruiters.models import Recruiter
from app.recruiters.schemas import (
    InvitationIssued,
    RecruiterInvite,
    RecruiterInvited,
    RecruiterUpdate,
    StaffMemberRead,
)

logger = logging.getLogger(__name__)

# A transaction-level advisory lock that serialises every change an admin makes to the
# team (pg_advisory_xact_lock; released at commit or rollback). Taken before any row
# lock, and by no other path, so it cannot join a deadlock. The number is arbitrary; it
# only has to be unique among this database's advisory locks.
_TEAM_CHANGES_LOCK = 7_281_130_001


async def _confirm_acting_admin(session: AsyncSession, admin: User) -> None:
    """Take the team lock, then re-read the admin making the change.

    get_current_user checked them at the start of the request, but another admin may
    have deactivated them since. Changes run one at a time, each re-reading its own
    admin, so when two admins deactivate each other at the same moment the second finds
    its admin already deactivated and is refused — the team always keeps an admin.
    """
    await session.execute(select(func.pg_advisory_xact_lock(_TEAM_CHANGES_LOCK)))
    acting = await session.get(User, admin.id, populate_existing=True)
    if acting is None or not acting.is_active or acting.role is not Role.ADMIN:
        await session.rollback()
        raise AccountDeactivatedError()


async def get_recruiter(session: AsyncSession, recruiter_id: uuid.UUID) -> Recruiter:
    recruiter = await session.get(Recruiter, recruiter_id)
    if recruiter is None:
        raise RecruiterNotFoundError(recruiter_id)
    return recruiter


async def update_recruiter(
    session: AsyncSession, recruiter_id: uuid.UUID, payload: RecruiterUpdate
) -> Recruiter:
    recruiter = await get_recruiter(session, recruiter_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(recruiter, field, value)
    await session.commit()
    return recruiter


# --- The admin's team ------------------------------------------------------------------


async def _invitation_expiries(
    session: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, datetime]:
    """When each account's current invitation link expires. One query for the whole page,
    never one per row."""
    if not user_ids:
        return {}
    # At most one row per account: every new link deletes the one before.
    rows = await session.execute(
        select(Invitation.user_id, Invitation.expires_at).where(Invitation.user_id.in_(user_ids))
    )
    return {user_id: expires_at for user_id, expires_at in rows.tuples()}


def _member(recruiter: Recruiter, invitation_expires_at: datetime | None) -> StaffMemberRead:
    member = StaffMemberRead.model_validate(recruiter)
    if member.status is StaffStatus.INVITED:
        member.invitation_expires_at = invitation_expires_at
    return member


async def _member_read(session: AsyncSession, recruiter: Recruiter) -> StaffMemberRead:
    expiries = await _invitation_expiries(session, [recruiter.id])
    return _member(recruiter, expiries.get(recruiter.id))


async def list_staff(
    session: AsyncSession, *, limit: int, offset: int
) -> tuple[list[StaffMemberRead], int]:
    """Every recruiter and admin, deactivated ones included, by name."""
    total = await session.scalar(select(func.count()).select_from(Recruiter)) or 0
    page = select(Recruiter).order_by(Recruiter.full_name, Recruiter.id)
    recruiters = list(await session.scalars(page.limit(limit).offset(offset)))
    expiries = await _invitation_expiries(session, [recruiter.id for recruiter in recruiters])
    return [_member(recruiter, expiries.get(recruiter.id)) for recruiter in recruiters], total


async def invite_recruiter(
    session: AsyncSession, payload: RecruiterInvite, *, admin: User
) -> RecruiterInvited:
    """Create a recruiter's account and profile, with no password, and an invitation link
    for them to choose one. All in one transaction: a taken email leaves nothing behind.
    """
    await _confirm_acting_admin(session, admin)
    user = User(
        id=uuid.uuid4(),
        email=payload.email,
        password_hash=None,
        role=Role.RECRUITER,
        deactivated_at=None,
    )
    recruiter = Recruiter(id=user.id, user=user, full_name=payload.full_name, title=payload.title)
    session.add(recruiter)
    # Flushed first so the users row exists before the invitation's foreign key needs it,
    # and so a taken email fails here, before a token is made.
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        # Only the email's unique index means "taken"; anything else is a real error.
        if violated_constraint(exc) != EMAIL_UNIQUE:
            raise
        # The unique index decides, not a SELECT first: two admins adding the same email
        # at once cannot both succeed.
        raise DuplicateEmailError("An account with this email already exists.") from exc

    token, expires_at = await auth_service.issue_invitation(
        session, user.id, issued_by=admin.id, replace_existing=False
    )
    await session.commit()
    logger.info("recruiter_invited user=%s by=%s", user.id, admin.id)
    return RecruiterInvited(
        member=_member(recruiter, expires_at),
        invitation=InvitationIssued(token=token, expires_at=expires_at),
    )


async def reissue_invitation(
    session: AsyncSession, recruiter_id: uuid.UUID, *, admin: User
) -> InvitationIssued:
    """A fresh link for someone who has not accepted yet — the first one expired, or was
    lost. The old link stops working.

    Checked under lock_account, so it cannot race the person accepting their current
    link: either they finish first and this refuses, or this replaces the link first and
    theirs stops working.
    """
    recruiter = await get_recruiter(session, recruiter_id)
    await _confirm_acting_admin(session, admin)
    # The lock refreshes recruiter.user from the locked row (populate_existing).
    await auth_service.lock_account(session, recruiter.id)
    current = recruiter.status
    if current is not StaffStatus.INVITED:
        # Read before the rollback: a rollback expires every loaded attribute.
        await session.rollback()
        raise InvitationNotAllowedError(
            "Reactivate this account before inviting them again."
            if current is StaffStatus.DEACTIVATED
            else "This person has already set a password."
        )

    token, expires_at = await auth_service.issue_invitation(
        session, recruiter.id, issued_by=admin.id, replace_existing=True
    )
    await session.commit()
    logger.info("invitation_reissued user=%s by=%s", recruiter.id, admin.id)
    return InvitationIssued(token=token, expires_at=expires_at)


async def deactivate(
    session: AsyncSession, recruiter_id: uuid.UUID, *, admin: User
) -> StaffMemberRead:
    """Stop a recruiter or admin from signing in, at once. Their profile, and their name
    on what they did, stay. Deactivating someone already deactivated changes nothing.

    The team can never be left without an admin: an admin cannot deactivate themself,
    and _confirm_acting_admin refuses the second of two admins deactivating each other.
    """
    if recruiter_id == admin.id:
        raise CannotDeactivateSelfError()
    recruiter = await get_recruiter(session, recruiter_id)
    await _confirm_acting_admin(session, admin)

    if await auth_service.deactivate_account(session, recruiter.id) is None:
        await session.rollback()
        raise RecruiterNotFoundError(recruiter_id)
    await session.commit()
    logger.info("staff_deactivated user=%s by=%s", recruiter.id, admin.id)
    # Deactivating deleted every invitation, so there is no expiry to look up.
    return _member(recruiter, None)


async def reactivate(
    session: AsyncSession, recruiter_id: uuid.UUID, *, admin: User
) -> StaffMemberRead:
    """Let them sign in again with their old password. Someone deactivated before they
    accepted their invitation needs a new link (reissue_invitation)."""
    recruiter = await get_recruiter(session, recruiter_id)
    await _confirm_acting_admin(session, admin)
    if await auth_service.reactivate_account(session, recruiter.id) is None:
        await session.rollback()
        raise RecruiterNotFoundError(recruiter_id)
    await session.commit()
    logger.info("staff_reactivated user=%s by=%s", recruiter.id, admin.id)
    return await _member_read(session, recruiter)
