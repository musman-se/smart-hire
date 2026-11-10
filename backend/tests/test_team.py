"""The hiring team: admins, invitations, and deactivating people who leave.

An admin does everything a recruiter does and also runs the team. A recruiter an admin
adds has no password until they accept their invitation link. Deactivating someone stops
them signing in at once, and keeps their account and profile.

`client` is signed in as the `recruiter` fixture; requests as the admin pass `as_admin`.
"""

import asyncio
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth import service as auth_service
from app.auth.cli import create_staff
from app.auth.enums import Role
from app.auth.errors import AccountDeactivatedError
from app.auth.models import Invitation, RefreshToken, User
from app.auth.security import hash_invitation_token, hash_refresh_token
from app.recruiters import service as recruiter_service
from app.recruiters.schemas import RecruiterInvite
from tests.conftest import bearer
from tests.factories import TEST_PASSWORD, make_candidate

NEW_PASSWORD = "a-brand-new-passphrase"


@pytest.fixture
def as_admin(admin: User) -> dict[str, str]:
    return bearer(admin.id)


async def invite(client: AsyncClient, as_admin: dict, **overrides) -> dict:
    body = {"email": "hina@example.com", "full_name": "Hina Raza"} | overrides
    response = await client.post("/recruiters", json=body, headers=as_admin)
    assert response.status_code == 201, response.text
    return response.json()


async def accept(client: AsyncClient, token: str, password: str = NEW_PASSWORD):
    return await client.post(
        "/auth/invitations/accept", json={"token": token, "password": password}
    )


async def sign_in(client: AsyncClient, email: str, password: str = NEW_PASSWORD):
    return await client.post("/auth/login", json={"email": email, "password": password})


# --- Who may manage the team ---------------------------------------------------------------


async def test_an_admin_does_a_recruiters_work_too(client: AsyncClient, as_admin: dict) -> None:
    created = await client.post(
        "/jobs",
        json={"title": "Data Engineer", "description": "Pipelines and warehouses, end to end."},
        headers=as_admin,
    )
    listed = await client.get("/candidates", headers=as_admin)

    assert created.status_code == 201
    assert listed.status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/recruiters"),
        ("POST", "/recruiters"),
        ("POST", "/recruiters/{id}/invitation"),
        ("POST", "/recruiters/{id}/deactivate"),
        ("POST", "/recruiters/{id}/reactivate"),
    ],
)
async def test_only_an_admin_manages_the_team(
    client: AsyncClient, admin: User, method: str, path: str
) -> None:
    candidate = await make_candidate(client)
    url = path.format(id=admin.id)
    body = {"email": "x@example.com", "full_name": "Some One"}

    as_recruiter = await client.request(method, url, json=body)
    as_candidate = await client.request(method, url, json=body, headers=candidate["auth"])

    assert as_recruiter.status_code == as_candidate.status_code == 403
    assert as_recruiter.json()["error"]["message"] == "Only an admin can do this."


async def test_the_team_lists_every_recruiter_and_admin(
    client: AsyncClient, as_admin: dict
) -> None:
    await make_candidate(client)
    await invite(client, as_admin)

    page = (await client.get("/recruiters", headers=as_admin)).json()

    assert page["total"] == 3  # the admin, the recruiter fixture, Hina — no candidate
    by_name = {member["full_name"]: member for member in page["items"]}
    assert list(by_name) == ["Hina Raza", "Nadia Malik", "Sara Ahmed"]
    assert by_name["Nadia Malik"]["role"] == "admin"
    assert by_name["Sara Ahmed"]["status"] == "active"
    assert by_name["Hina Raza"]["status"] == "invited"
    assert by_name["Hina Raza"]["invitation_expires_at"] is not None


# --- Inviting a recruiter ----------------------------------------------------------------


async def test_an_invited_recruiter_sets_a_password_and_is_signed_in(
    client: AsyncClient, anonymous: AsyncClient, as_admin: dict
) -> None:
    invited = await invite(client, as_admin, email="  Hina@Example.com", title="Sourcer")
    token = invited["invitation"]["token"]
    assert invited["member"]["email"] == "hina@example.com"
    assert invited["member"]["title"] == "Sourcer"

    # No password yet: signing in is refused like any wrong password.
    assert (await sign_in(anonymous, "hina@example.com")).status_code == 401

    preview = await anonymous.post("/auth/invitations/preview", json={"token": token})
    assert preview.status_code == 200
    assert preview.json()["full_name"] == "Hina Raza"
    assert preview.json()["email"] == "hina@example.com"

    accepted = await accept(anonymous, token)
    assert accepted.status_code == 200
    me = await anonymous.get(
        "/auth/me", headers={"Authorization": f"Bearer {accepted.json()['access_token']}"}
    )
    assert me.json()["role"] == "recruiter"
    assert (await sign_in(anonymous, "hina@example.com")).status_code == 200

    team = (await client.get("/recruiters", headers=as_admin)).json()["items"]
    hina = next(member for member in team if member["email"] == "hina@example.com")
    assert hina["status"] == "active"
    assert hina["invitation_expires_at"] is None


async def test_an_invitation_link_works_once(
    client: AsyncClient, anonymous: AsyncClient, as_admin: dict
) -> None:
    token = (await invite(client, as_admin))["invitation"]["token"]
    assert (await accept(anonymous, token)).status_code == 200

    again = await accept(anonymous, token, password="someone-elses-password")
    preview = await anonymous.post("/auth/invitations/preview", json={"token": token})

    assert again.status_code == preview.status_code == 404
    assert again.json()["error"]["code"] == "invalid_invitation"
    # The second attempt changed nothing: the first password still works.
    assert (await sign_in(anonymous, "hina@example.com")).status_code == 200


async def test_only_a_hash_of_the_invitation_token_is_stored(
    client: AsyncClient, session: AsyncSession, as_admin: dict
) -> None:
    token = (await invite(client, as_admin))["invitation"]["token"]

    stored = await session.scalar(select(Invitation.token_hash))

    assert stored == hash_invitation_token(token)
    assert token not in stored


async def test_an_expired_invitation_is_refused(
    client: AsyncClient, anonymous: AsyncClient, session: AsyncSession, as_admin: dict
) -> None:
    token = (await invite(client, as_admin))["invitation"]["token"]
    await session.execute(
        update(Invitation).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    await session.commit()

    response = await accept(anonymous, token)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invalid_invitation"


async def test_a_new_link_replaces_the_old_one(
    client: AsyncClient, anonymous: AsyncClient, as_admin: dict
) -> None:
    invited = await invite(client, as_admin)
    old = invited["invitation"]["token"]

    reissued = await client.post(
        f"/recruiters/{invited['member']['id']}/invitation", headers=as_admin
    )

    assert reissued.status_code == 201
    assert (await accept(anonymous, old)).status_code == 404
    assert (await accept(anonymous, reissued.json()["token"])).status_code == 200


async def test_someone_already_set_up_needs_no_new_link(
    client: AsyncClient, recruiter: User, as_admin: dict
) -> None:
    response = await client.post(f"/recruiters/{recruiter.id}/invitation", headers=as_admin)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invitation_not_allowed"


async def test_an_email_already_in_use_cannot_be_invited(
    client: AsyncClient, as_admin: dict
) -> None:
    await make_candidate(client, email="taken@example.com")

    response = await client.post(
        "/recruiters",
        json={"email": "TAKEN@example.com", "full_name": "Some One"},
        headers=as_admin,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_email"
    assert (await client.get("/recruiters", headers=as_admin)).json()["total"] == 2


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not-an-email", "full_name": "Some One"},
        {"email": "a@example.com", "full_name": " A "},
        {"email": "a@example.com", "full_name": "Some One", "title": "x" * 101},
    ],
    ids=["bad-email", "short-name", "long-title"],
)
async def test_an_invalid_invitation_is_refused_before_the_database(
    client: AsyncClient, as_admin: dict, body: dict
) -> None:
    assert (await client.post("/recruiters", json=body, headers=as_admin)).status_code == 422


async def test_a_new_password_follows_the_registration_rules(
    client: AsyncClient, anonymous: AsyncClient, as_admin: dict
) -> None:
    token = (await invite(client, as_admin))["invitation"]["token"]

    assert (await accept(anonymous, token, password="short")).status_code == 422
    assert (await accept(anonymous, token)).status_code == 200


# --- Deactivating ------------------------------------------------------------------------


async def test_deactivating_someone_ends_their_access_at_once(
    client: AsyncClient, anonymous: AsyncClient, recruiter: User, as_admin: dict
) -> None:
    tokens = (await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)).json()
    their_auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (await anonymous.get("/jobs", headers=their_auth)).status_code == 200

    response = await client.post(f"/recruiters/{recruiter.id}/deactivate", headers=as_admin)

    assert response.status_code == 200
    assert response.json()["status"] == "deactivated"
    assert response.json()["deactivated_at"] is not None
    # The access token stops now, not when it expires; the refresh token is gone.
    assert (await anonymous.get("/jobs", headers=their_auth)).status_code == 401
    refreshed = await anonymous.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 401
    # The right password is told why, and only then.
    signed_in = await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)
    assert signed_in.status_code == 403
    assert signed_in.json()["error"]["code"] == "account_deactivated"
    wrong = await sign_in(anonymous, "recruiter@example.com", "not-the-password")
    assert wrong.json()["error"]["code"] == "invalid_credentials"


async def test_a_reactivated_recruiter_signs_in_with_their_old_password(
    client: AsyncClient, anonymous: AsyncClient, recruiter: User, as_admin: dict
) -> None:
    await client.post(f"/recruiters/{recruiter.id}/deactivate", headers=as_admin)

    response = await client.post(f"/recruiters/{recruiter.id}/reactivate", headers=as_admin)

    assert response.json()["status"] == "active"
    assert response.json()["deactivated_at"] is None
    assert (await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)).status_code == 200


async def test_deactivating_an_invited_recruiter_kills_their_link(
    client: AsyncClient, anonymous: AsyncClient, as_admin: dict
) -> None:
    invited = await invite(client, as_admin)
    member_id = invited["member"]["id"]

    await client.post(f"/recruiters/{member_id}/deactivate", headers=as_admin)
    assert (await accept(anonymous, invited["invitation"]["token"])).status_code == 404
    refused = await client.post(f"/recruiters/{member_id}/invitation", headers=as_admin)
    assert refused.status_code == 409

    # Reactivated, they are invited again but hold no link until they get a new one.
    reactivated = await client.post(f"/recruiters/{member_id}/reactivate", headers=as_admin)
    assert reactivated.json()["status"] == "invited"
    assert reactivated.json()["invitation_expires_at"] is None
    fresh = await client.post(f"/recruiters/{member_id}/invitation", headers=as_admin)
    assert (await accept(anonymous, fresh.json()["token"])).status_code == 200


async def test_an_admin_cannot_deactivate_themself(
    client: AsyncClient, admin: User, as_admin: dict
) -> None:
    response = await client.post(f"/recruiters/{admin.id}/deactivate", headers=as_admin)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "cannot_deactivate_self"


async def test_a_candidate_is_not_on_the_team(client: AsyncClient, as_admin: dict) -> None:
    candidate = await make_candidate(client)

    response = await client.post(f"/recruiters/{candidate['id']}/deactivate", headers=as_admin)

    assert response.status_code == 404


async def test_deactivating_keeps_the_account_and_profile(
    client: AsyncClient, session: AsyncSession, recruiter: User, as_admin: dict
) -> None:
    await client.post(f"/recruiters/{recruiter.id}/deactivate", headers=as_admin)

    stored = await session.get(User, recruiter.id)

    assert stored is not None
    assert stored.deactivated_at is not None
    team = (await client.get("/recruiters", headers=as_admin)).json()
    assert any(member["full_name"] == "Sara Ahmed" for member in team["items"])


# --- The first admin ---------------------------------------------------------------------


async def test_the_cli_creates_an_admin(engine, anonymous: AsyncClient) -> None:
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    created = await create_staff(
        sessions, "owner@example.com", TEST_PASSWORD, "Omar Sheikh", exist_ok=False, role=Role.ADMIN
    )
    repeated = await create_staff(
        sessions, "owner@example.com", "ignored-pw", "Ignored", exist_ok=True, role=Role.ADMIN
    )

    assert created.startswith("Created admin owner@example.com")
    assert "already exists" in repeated
    tokens = (await sign_in(anonymous, "owner@example.com", TEST_PASSWORD)).json()
    me = await anonymous.get(
        "/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.json()["role"] == "admin"


async def test_create_admin_never_promotes_an_existing_recruiter(engine, recruiter: User) -> None:
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    with pytest.raises(SystemExit, match=re.escape("already exists (recruiter)")):
        await create_staff(
            sessions,
            "recruiter@example.com",
            TEST_PASSWORD,
            "Sara Ahmed",
            exist_ok=True,
            role=Role.ADMIN,
        )


async def test_deactivating_during_an_acceptance_does_not_deadlock(
    engine, client: AsyncClient, as_admin: dict
) -> None:
    """accept_invitation locks the invitation, then the user. Deactivating used to lock
    the user, then delete the invitation: run together, each waited for the other, and
    Postgres killed one with a deadlock error. Now every path locks an account's tokens
    and invitations before the user (auth.service.lock_account)."""
    invited = await invite(client, as_admin)
    user_id = uuid.UUID(invited["member"]["id"])
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def deactivate(db_session: AsyncSession) -> None:
        await auth_service.deactivate_account(db_session, user_id)
        await db_session.commit()

    async with sessions() as accepting, sessions() as deactivating:
        # The accepting side holds the invitation's row, as accept_invitation does ...
        await accepting.execute(
            select(Invitation).where(Invitation.user_id == user_id).with_for_update()
        )
        # ... while an admin deactivates the account and takes whatever it can.
        deactivation = asyncio.create_task(deactivate(deactivating))
        await asyncio.sleep(0.5)
        # Then the accepting side locks the user, which it can only get if deactivating
        # did not take it first.
        await asyncio.wait_for(
            accepting.execute(select(User).where(User.id == user_id).with_for_update()),
            timeout=5,
        )
        await accepting.commit()
        await asyncio.wait_for(deactivation, timeout=5)

    team = (await client.get("/recruiters", headers=as_admin)).json()["items"]
    assert next(m for m in team if m["id"] == str(user_id))["status"] == "deactivated"


async def test_two_admins_cannot_deactivate_each_other(
    engine, client: AsyncClient, admin: User, as_admin: dict
) -> None:
    """Each admin may deactivate the other, but not both: the team would be left with no
    admin and no way back except the command line. A request whose admin was deactivated
    after it passed its sign-in check — the second of two crossing requests — is refused."""
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    other = await auth_service.create_staff_account(
        sessions(), "second.admin@example.com", TEST_PASSWORD, "Omar Sheikh", role=Role.ADMIN
    )

    async with sessions() as crossing:
        # admin's request has loaded its user, still active ...
        stale_admin = await crossing.get(User, admin.id)
        # ... when the other admin's request deactivates admin.
        first = await client.post(f"/recruiters/{admin.id}/deactivate", headers=bearer(other.id))
        assert first.status_code == 200

        with pytest.raises(AccountDeactivatedError):
            await recruiter_service.deactivate(crossing, other.id, admin=stale_admin)

    team = (await client.get("/recruiters", headers=bearer(other.id))).json()["items"]
    assert next(m for m in team if m["id"] == str(other.id))["status"] == "active"


async def test_a_sign_in_racing_a_deactivation_leaves_no_session(
    client: AsyncClient,
    anonymous: AsyncClient,
    session: AsyncSession,
    recruiter: User,
    as_admin: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The admin deactivates the account while its password is being checked. The sign-in
    is refused, and no refresh token is left behind to come back to life on reactivation."""
    real_verify = auth_service.verify_password

    async def verify_while_deactivated(password: str, stored_hash: str | None):
        result = await real_verify(password, stored_hash)
        response = await client.post(f"/recruiters/{recruiter.id}/deactivate", headers=as_admin)
        assert response.status_code == 200
        return result

    monkeypatch.setattr(auth_service, "verify_password", verify_while_deactivated)

    signed_in = await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)

    assert signed_in.status_code == 403
    assert signed_in.json()["error"]["code"] == "account_deactivated"
    tokens = await session.scalar(
        select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == recruiter.id)
    )
    assert tokens == 0


async def test_spaces_around_a_name_do_not_count_against_its_limit(
    client: AsyncClient, as_admin: dict
) -> None:
    name = "N" * 160

    invited = await invite(client, as_admin, full_name=f"  {name} ", title="  Sourcer  ")

    assert invited["member"]["full_name"] == name
    assert invited["member"]["title"] == "Sourcer"


@pytest.mark.parametrize("action", ["invite", "reissue", "deactivate", "reactivate"])
async def test_every_team_change_refuses_an_admin_deactivated_mid_request(
    engine, client: AsyncClient, admin: User, as_admin: dict, action: str
) -> None:
    """The guard deactivate needs (two admins crossing) holds for every change an admin
    makes: a request that passed its sign-in check before its admin was deactivated
    changes nothing."""
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    other = await auth_service.create_staff_account(
        sessions(), "second.admin@example.com", TEST_PASSWORD, "Omar Sheikh", role=Role.ADMIN
    )
    invited = await invite(client, as_admin)
    target = uuid.UUID(invited["member"]["id"])

    async with sessions() as crossing:
        stale_admin = await crossing.get(User, admin.id)
        await client.post(f"/recruiters/{admin.id}/deactivate", headers=bearer(other.id))

        with pytest.raises(AccountDeactivatedError):
            if action == "invite":
                body = RecruiterInvite(email="late@example.com", full_name="Late Hire")
                await recruiter_service.invite_recruiter(crossing, body, admin=stale_admin)
            elif action == "reissue":
                await recruiter_service.reissue_invitation(crossing, target, admin=stale_admin)
            elif action == "deactivate":
                await recruiter_service.deactivate(crossing, target, admin=stale_admin)
            else:
                await recruiter_service.reactivate(crossing, target, admin=stale_admin)

    team = (await client.get("/recruiters", headers=bearer(other.id))).json()
    assert team["total"] == 4  # nobody added
    hina = next(m for m in team["items"] if m["id"] == str(target))
    assert hina["status"] == "invited"  # nobody deactivated


async def test_a_sign_in_racing_a_password_change_does_not_undo_it(
    anonymous: AsyncClient,
    session: AsyncSession,
    recruiter: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The password changes while the old one is being checked at sign-in. The sign-in
    is refused rather than issuing a session for the old password — or saving a fresh
    hash of it over the new one."""
    real_verify = auth_service.verify_password
    replaced_hash = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"

    async def verify_while_changed(password: str, stored_hash: str | None):
        result = await real_verify(password, stored_hash)
        await session.execute(
            update(User).where(User.id == recruiter.id).values(password_hash=replaced_hash)
        )
        await session.commit()
        return result

    monkeypatch.setattr(auth_service, "verify_password", verify_while_changed)

    signed_in = await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)

    assert signed_in.status_code == 401
    stored = await session.scalar(select(User.password_hash).where(User.id == recruiter.id))
    assert stored == replaced_hash


async def test_theft_detection_racing_a_deactivation_does_not_deadlock(
    engine,
    client: AsyncClient,
    anonymous: AsyncClient,
    session: AsyncSession,
    recruiter: User,
) -> None:
    """A reused refresh token ends every session; it holds that one token's lock and then
    needs all the others. Deactivating takes all of them in id order. Holding one while
    waiting for the rest used to deadlock against that; now the reuse path lets go of its
    token first and takes every lock in the same order."""
    raw = [
        (await sign_in(anonymous, "recruiter@example.com", TEST_PASSWORD)).json()["refresh_token"]
        for _ in range(2)
    ]
    rows = {hash_refresh_token(token): token for token in raw}
    ordered = list(
        await session.scalars(
            select(RefreshToken)
            .where(RefreshToken.user_id == recruiter.id)
            .order_by(RefreshToken.id)
        )
    )
    low, high = ordered
    # The higher token was rotated long ago: presenting it again is theft.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.id == high.id)
        .values(revoked_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await session.commit()
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async with sessions() as deactivating:
        # The deactivation has taken the lower token, in id order ...
        await deactivating.execute(
            select(RefreshToken).where(RefreshToken.id == low.id).with_for_update()
        )
        # ... when the stolen higher one is presented.
        presented = asyncio.create_task(
            anonymous.post("/auth/refresh", json={"refresh_token": rows[high.token_hash]})
        )
        await asyncio.sleep(0.5)
        # The deactivation goes on to the higher token, which the refresh held.
        await asyncio.wait_for(
            deactivating.execute(
                select(RefreshToken).where(RefreshToken.id == high.id).with_for_update()
            ),
            timeout=5,
        )
        await deactivating.commit()
        response = await asyncio.wait_for(presented, timeout=5)

    assert response.status_code == 401
    left = await session.scalar(
        select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == recruiter.id)
    )
    assert left == 0
