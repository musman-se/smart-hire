"""Authentication and authorisation.

Who may call what is a rule like any other the API enforces, so it is tested the same
way: through HTTP, against the real database. The matrix tests at the bottom are the
ones to read first — each row is a sentence from the access rules.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.cli import create_staff
from app.auth.enums import Role
from app.auth.models import RefreshToken, User
from app.auth.security import create_access_token
from app.core.config import settings
from app.main import app
from tests.factories import TEST_PASSWORD, apply, make_candidate, make_job


async def sign_in(client: AsyncClient, email: str, password: str = TEST_PASSWORD):
    return await client.post("/auth/login", json={"email": email, "password": password})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Registering and signing in -------------------------------------------------------


async def test_a_registered_candidate_can_sign_in(anonymous: AsyncClient) -> None:
    await make_candidate(anonymous, email="ayesha@example.com")

    response = await sign_in(anonymous, "  Ayesha@Example.com ")

    assert response.status_code == 200
    tokens = response.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] == settings.access_token_minutes * 60
    me = await anonymous.get("/auth/me", headers=bearer(tokens["access_token"]))
    assert me.json()["email"] == "ayesha@example.com"
    assert me.json()["role"] == "candidate"


async def test_a_wrong_password_and_an_unknown_email_get_the_same_answer(
    anonymous: AsyncClient,
) -> None:
    """Different answers would let anyone test which emails have accounts."""
    await make_candidate(anonymous, email="known@example.com")

    wrong_password = await sign_in(anonymous, "known@example.com", "not-the-password")
    unknown_email = await sign_in(anonymous, "nobody@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["error"]["code"] == "invalid_credentials"
    assert wrong_password.json()["error"]["message"] == unknown_email.json()["error"]["message"]


async def test_an_account_without_a_password_cannot_sign_in(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """The candidates who registered before accounts existed got one with no password."""
    session.add(User(email="legacy@example.com", role=Role.CANDIDATE, password_hash=None))
    await session.commit()

    response = await sign_in(anonymous, "legacy@example.com")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_the_password_is_stored_as_an_argon2id_hash(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    await make_candidate(anonymous, email="hashed@example.com")

    stored = await session.scalar(select(User).where(User.email == "hashed@example.com"))

    assert stored.password_hash.startswith("$argon2id$")
    assert TEST_PASSWORD not in stored.password_hash


async def test_a_short_password_is_refused(anonymous: AsyncClient) -> None:
    response = await anonymous.post(
        "/auth/register",
        json={"email": "short@example.com", "full_name": "Short Pass", "password": "1234567"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"].startswith("password:")
    assert "1234567" not in response.text


async def test_a_weaker_hash_is_upgraded_at_sign_in(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """Raising the hashing cost later does not strand existing users: each hash is
    replaced with a current one the next time its password is proved."""
    weaker = PasswordHash((Argon2Hasher(time_cost=1, memory_cost=512, parallelism=1),))
    old_hash = weaker.hash(TEST_PASSWORD)
    session.add(User(email="old@example.com", role=Role.CANDIDATE, password_hash=old_hash))
    await session.commit()

    assert (await sign_in(anonymous, "old@example.com")).status_code == 200

    session.expire_all()
    stored = await session.scalar(select(User).where(User.email == "old@example.com"))
    assert stored.password_hash != old_hash
    assert (await sign_in(anonymous, "old@example.com")).status_code == 200


# --- Access tokens --------------------------------------------------------------------


async def test_no_token_is_401_with_a_bearer_challenge(anonymous: AsyncClient) -> None:
    response = await anonymous.get("/jobs")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"
    assert response.headers["WWW-Authenticate"] == "Bearer"


def _forged(**overrides) -> str:
    now = datetime.now(UTC)
    claims = {"sub": str(uuid.uuid4()), "iat": now, "exp": now + timedelta(minutes=5)}
    return jwt.encode(claims | overrides.pop("claims", {}), **overrides)


@pytest.mark.parametrize(
    "make_token",
    [
        lambda: "not-a-jwt",
        lambda: create_access_token(uuid.uuid4(), now=datetime.now(UTC) - timedelta(hours=2)),
        lambda: _forged(key="a-different-key-of-at-least-32-chars!", algorithm="HS256"),
        lambda: _forged(key="", algorithm="none"),
        # Signed with the real key, so it is the subject that fails, not the signature.
        lambda: _forged(
            key=settings.jwt_secret_key.get_secret_value(),
            algorithm="HS256",
            claims={"sub": "not-a-uuid"},
        ),
    ],
    ids=["garbage", "expired", "wrong-key", "alg-none", "bad-subject"],
)
async def test_an_unusable_token_is_refused(anonymous: AsyncClient, make_token) -> None:
    response = await anonymous.get("/jobs", headers=bearer(make_token()))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


async def test_a_valid_token_for_a_user_who_no_longer_exists_is_refused(
    anonymous: AsyncClient,
) -> None:
    response = await anonymous.get("/jobs", headers=bearer(create_access_token(uuid.uuid4())))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


# --- Refresh tokens -------------------------------------------------------------------


async def test_refreshing_rotates_the_refresh_token(anonymous: AsyncClient) -> None:
    await make_candidate(anonymous, email="rotate@example.com")
    first = (await sign_in(anonymous, "rotate@example.com")).json()

    second = await anonymous.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})

    assert second.status_code == 200
    assert second.json()["refresh_token"] != first["refresh_token"]
    me = await anonymous.get("/auth/me", headers=bearer(second.json()["access_token"]))
    assert me.status_code == 200


async def _age_rotations(session: AsyncSession, seconds: int = 60) -> None:
    """Move every rotation into the past, beyond the reuse grace period."""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked_at.is_not(None))
        .values(revoked_at=datetime.now(UTC) - timedelta(seconds=seconds))
    )
    await session.commit()


async def test_reusing_a_refresh_token_revokes_every_session(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """The old token being presented again means it was copied. Both the thief's next
    refresh and the owner's are refused; the owner signs in again."""
    await make_candidate(anonymous, email="stolen@example.com")
    stolen = (await sign_in(anonymous, "stolen@example.com")).json()["refresh_token"]
    rotated = (await anonymous.post("/auth/refresh", json={"refresh_token": stolen})).json()
    await _age_rotations(session)

    replay = await anonymous.post("/auth/refresh", json={"refresh_token": stolen})
    owner = await anonymous.post("/auth/refresh", json={"refresh_token": rotated["refresh_token"]})

    assert replay.status_code == owner.status_code == 401
    assert owner.json()["error"]["code"] == "invalid_refresh_token"
    assert (await sign_in(anonymous, "stolen@example.com")).status_code == 200


async def test_a_token_presented_again_moments_after_rotating_is_not_theft(
    anonymous: AsyncClient,
) -> None:
    """A page reloaded while its refresh was in flight presents the token it just
    rotated. That is refused, but the user's other sessions carry on."""
    await make_candidate(anonymous, email="reload@example.com")
    raced = (await sign_in(anonymous, "reload@example.com")).json()["refresh_token"]
    await anonymous.post("/auth/refresh", json={"refresh_token": raced})
    elsewhere = (await sign_in(anonymous, "reload@example.com")).json()["refresh_token"]

    again = await anonymous.post("/auth/refresh", json={"refresh_token": raced})

    assert again.status_code == 401
    still = await anonymous.post("/auth/refresh", json={"refresh_token": elsewhere})
    assert still.status_code == 200


async def test_old_devices_cannot_end_the_sessions_signed_in_after_a_theft(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """Ending every session deletes the live tokens rather than marking them. Marked,
    each old device presenting its token later looked like a second theft and ended
    the user's new sessions all over again."""
    await make_candidate(anonymous, email="cascade@example.com")
    stolen = (await sign_in(anonymous, "cascade@example.com")).json()["refresh_token"]
    phone = (await sign_in(anonymous, "cascade@example.com")).json()["refresh_token"]
    await anonymous.post("/auth/refresh", json={"refresh_token": stolen})
    await _age_rotations(session)
    await anonymous.post("/auth/refresh", json={"refresh_token": stolen})  # every session ends
    await _age_rotations(session)  # the phone wakes up long after

    laptop = (await sign_in(anonymous, "cascade@example.com")).json()["refresh_token"]
    old_phone = await anonymous.post("/auth/refresh", json={"refresh_token": phone})

    assert old_phone.status_code == 401
    assert (
        await anonymous.post("/auth/refresh", json={"refresh_token": laptop})
    ).status_code == 200


async def test_a_stolen_token_cannot_end_the_owners_next_session_too(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """Ending every session deletes all the user's tokens, the stolen one included.
    Kept, it could be replayed — through refresh or logout, neither of which needs an
    access token — to end each session the owner started afterwards."""
    await make_candidate(anonymous, email="replay@example.com")
    stolen = (await sign_in(anonymous, "replay@example.com")).json()["refresh_token"]
    await anonymous.post("/auth/refresh", json={"refresh_token": stolen})  # the thief
    await _age_rotations(session)
    await anonymous.post("/auth/refresh", json={"refresh_token": stolen})  # every session ends

    fresh = (await sign_in(anonymous, "replay@example.com")).json()["refresh_token"]
    await anonymous.post("/auth/refresh", json={"refresh_token": stolen})
    await anonymous.post("/auth/logout", json={"refresh_token": stolen})

    assert (await anonymous.post("/auth/refresh", json={"refresh_token": fresh})).status_code == 200


async def test_signing_out_with_a_token_someone_else_rotated_ends_every_session(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    """The owner signs out with the token a thief has already exchanged: the thief's
    session must not survive the owner's sign-out."""
    await make_candidate(anonymous, email="signout@example.com")
    owners = (await sign_in(anonymous, "signout@example.com")).json()["refresh_token"]
    thiefs = (await anonymous.post("/auth/refresh", json={"refresh_token": owners})).json()
    await _age_rotations(session)

    signed_out = await anonymous.post("/auth/logout", json={"refresh_token": owners})

    assert signed_out.status_code == 204
    thief = await anonymous.post("/auth/refresh", json={"refresh_token": thiefs["refresh_token"]})
    assert thief.status_code == 401


async def test_an_expired_refresh_token_is_refused(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    await make_candidate(anonymous, email="expired@example.com")
    tokens = (await sign_in(anonymous, "expired@example.com")).json()
    await session.execute(
        update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await session.commit()

    response = await anonymous.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert response.status_code == 401


async def test_only_a_hash_of_the_refresh_token_is_stored(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    await make_candidate(anonymous, email="hashonly@example.com")
    raw = (await sign_in(anonymous, "hashonly@example.com")).json()["refresh_token"]

    stored = list(await session.scalars(select(RefreshToken.token_hash)))

    assert raw not in stored
    assert all(len(token_hash) == 64 for token_hash in stored)


async def test_a_signed_out_token_is_not_treated_as_stolen(anonymous: AsyncClient) -> None:
    """Signing out in one tab, then that tab's token turning up again, must not end the
    user's other sessions — only reuse of a *rotated* token means theft."""
    await make_candidate(anonymous, email="twotabs@example.com")
    laptop = (await sign_in(anonymous, "twotabs@example.com")).json()
    phone = (await sign_in(anonymous, "twotabs@example.com")).json()
    await anonymous.post("/auth/logout", json={"refresh_token": laptop["refresh_token"]})

    replayed = await anonymous.post(
        "/auth/refresh", json={"refresh_token": laptop["refresh_token"]}
    )
    still_signed_in = await anonymous.post(
        "/auth/refresh", json={"refresh_token": phone["refresh_token"]}
    )

    assert replayed.status_code == 401
    assert still_signed_in.status_code == 200


async def test_an_expired_rotated_token_does_not_end_other_sessions(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    await make_candidate(anonymous, email="oldtoken@example.com")
    old = (await sign_in(anonymous, "oldtoken@example.com")).json()["refresh_token"]
    await anonymous.post("/auth/refresh", json={"refresh_token": old})  # rotated
    other = (await sign_in(anonymous, "oldtoken@example.com")).json()["refresh_token"]
    # Rotated long ago *and* expired: outside the grace window, so only the expiry can be
    # what spares the other session.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked_at.is_not(None))
        .values(
            revoked_at=datetime.now(UTC) - timedelta(minutes=5),
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
    )
    await session.commit()

    assert (await anonymous.post("/auth/refresh", json={"refresh_token": old})).status_code == 401
    assert (await anonymous.post("/auth/refresh", json={"refresh_token": other})).status_code == 200


async def test_signing_out_revokes_the_refresh_token(anonymous: AsyncClient) -> None:
    await make_candidate(anonymous, email="bye@example.com")
    tokens = (await sign_in(anonymous, "bye@example.com")).json()
    body = {"refresh_token": tokens["refresh_token"]}

    first = await anonymous.post("/auth/logout", json=body)
    again = await anonymous.post("/auth/logout", json=body)
    unknown = await anonymous.post("/auth/logout", json={"refresh_token": "never-issued"})

    assert first.status_code == again.status_code == unknown.status_code == 204
    assert (await anonymous.post("/auth/refresh", json=body)).status_code == 401


# --- Changing the password --------------------------------------------------------------

NEW_PASSWORD = "a-brand-new-passphrase"


async def change_password(
    client: AsyncClient, access_token: str, current: str = TEST_PASSWORD, new: str = NEW_PASSWORD
):
    return await client.post(
        "/auth/change-password",
        json={"current_password": current, "new_password": new},
        headers=bearer(access_token),
    )


async def test_changing_the_password_replaces_the_old_one(anonymous: AsyncClient) -> None:
    await make_candidate(anonymous, email="change@example.com")
    tokens = (await sign_in(anonymous, "change@example.com")).json()

    response = await change_password(anonymous, tokens["access_token"])

    assert response.status_code == 200
    assert (await sign_in(anonymous, "change@example.com")).status_code == 401
    assert (await sign_in(anonymous, "change@example.com", NEW_PASSWORD)).status_code == 200


async def test_changing_the_password_ends_every_session_but_starts_a_new_one(
    anonymous: AsyncClient,
) -> None:
    """The laptop that changed it stays signed in on the pair it gets back; the phone,
    and the laptop's own old refresh token, are done."""
    await make_candidate(anonymous, email="devices@example.com")
    laptop = (await sign_in(anonymous, "devices@example.com")).json()
    phone = (await sign_in(anonymous, "devices@example.com")).json()

    fresh = (await change_password(anonymous, laptop["access_token"])).json()

    for old in (laptop, phone):
        refused = await anonymous.post(
            "/auth/refresh", json={"refresh_token": old["refresh_token"]}
        )
        assert refused.status_code == 401
    renewed = await anonymous.post("/auth/refresh", json={"refresh_token": fresh["refresh_token"]})
    assert renewed.status_code == 200
    me = await anonymous.get("/auth/me", headers=bearer(fresh["access_token"]))
    assert me.json()["email"] == "devices@example.com"


async def test_a_wrong_current_password_changes_nothing(anonymous: AsyncClient) -> None:
    """403, not 401: the token is fine, and a 401 would make the console refresh it and
    then sign the user out over a typo."""
    await make_candidate(anonymous, email="typo@example.com")
    tokens = (await sign_in(anonymous, "typo@example.com")).json()

    response = await change_password(anonymous, tokens["access_token"], current="not-it-at-all")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "invalid_current_password"
    assert (await sign_in(anonymous, "typo@example.com")).status_code == 200
    kept = await anonymous.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert kept.status_code == 200


@pytest.mark.parametrize(
    ("new", "why"),
    [("1234567", "too short"), ("x" * 129, "too long"), (TEST_PASSWORD, "unchanged")],
)
async def test_the_new_password_must_be_valid_and_different(
    anonymous: AsyncClient, new: str, why: str
) -> None:
    await make_candidate(anonymous, email=f"rules-{len(new)}@example.com")
    tokens = (await sign_in(anonymous, f"rules-{len(new)}@example.com")).json()

    response = await change_password(anonymous, tokens["access_token"], new=new)

    assert response.status_code == 422, why
    assert response.json()["error"]["code"] == "validation_error"
    assert (await sign_in(anonymous, f"rules-{len(new)}@example.com")).status_code == 200


async def test_the_new_password_is_stored_as_an_argon2id_hash(
    anonymous: AsyncClient, session: AsyncSession
) -> None:
    await make_candidate(anonymous, email="rehash@example.com")
    tokens = (await sign_in(anonymous, "rehash@example.com")).json()

    await change_password(anonymous, tokens["access_token"])

    stored = await session.scalar(select(User).where(User.email == "rehash@example.com"))
    assert stored.password_hash.startswith("$argon2id$")
    assert NEW_PASSWORD not in stored.password_hash


async def test_a_recruiter_can_change_their_password_too(engine, anonymous: AsyncClient) -> None:
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    await create_staff(
        sessions, "hr-change@example.com", TEST_PASSWORD, "Hina Raza", exist_ok=False
    )
    tokens = (await sign_in(anonymous, "hr-change@example.com")).json()

    response = await change_password(anonymous, tokens["access_token"])

    assert response.status_code == 200
    assert (await sign_in(anonymous, "hr-change@example.com", NEW_PASSWORD)).status_code == 200


# --- Secure by default ------------------------------------------------------------------

PUBLIC_ROUTES = {
    ("GET", "/health"),
    ("GET", "/health/ready"),
    ("POST", "/auth/register"),
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
    # The person opening an invitation link has no account they can sign in to yet; the
    # token in the body is their proof.
    ("POST", "/auth/invitations/preview"),
    ("POST", "/auth/invitations/accept"),
}


def _protected_routes() -> list[tuple[str, str]]:
    """Every operation in the OpenAPI document, which is the app's own inventory of its
    endpoints. (app.routes is not: since FastAPI 0.141 an included router appears there
    as one lazy entry, so it listed none of them.)"""
    return sorted(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if (method.upper(), path) not in PUBLIC_ROUTES
    )


PROTECTED_ROUTES = _protected_routes()


def test_the_route_inventory_is_complete() -> None:
    """An empty inventory would skip the test below and pass silently — it did once."""
    assert ("POST", "/jobs") in PROTECTED_ROUTES
    assert ("GET", "/applications/{application_id}/history") in PROTECTED_ROUTES
    assert ("GET", "/auth/me") in PROTECTED_ROUTES


@pytest.mark.parametrize(("method", "path"), PROTECTED_ROUTES)
async def test_every_other_route_requires_a_token(
    anonymous: AsyncClient, method: str, path: str
) -> None:
    """Fails for any new endpoint that answers without a token, unless it is added to
    PUBLIC_ROUTES on purpose."""
    url = path
    for name in ("job_id", "candidate_id", "application_id", "recruiter_id"):
        url = url.replace("{" + name + "}", str(uuid.uuid4()))

    response = await anonymous.request(method, url, json={})

    assert response.status_code == 401, f"{method} {path} answered {response.status_code}"


# --- Who may do what --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/jobs"),
        ("PATCH", "/jobs/{job}"),
        ("DELETE", "/jobs/{job}"),
        ("POST", "/jobs/{job}/publish"),
        ("POST", "/jobs/{job}/close"),
        ("POST", "/jobs/{job}/reopen"),
        ("GET", "/jobs/{job}/content"),
        ("GET", "/jobs/{job}/publication"),
        ("GET", "/jobs/{job}/applications"),
        ("GET", "/candidates"),
        ("POST", "/applications/{application}/stage"),
        ("POST", "/applications/{application}/process"),
        ("GET", "/recruiters/me"),
        ("PATCH", "/recruiters/me"),
    ],
)
async def test_a_candidate_cannot_do_a_recruiters_work(
    client: AsyncClient, method: str, path: str
) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    url = path.format(job=job["id"], application=application["id"])

    response = await client.request(
        method, url, json={"stage": "screening"}, headers=candidate["auth"]
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_a_candidate_sees_only_published_jobs(client: AsyncClient) -> None:
    published = await make_job(client, title="Open Role")
    draft = await make_job(client, title="Draft Role", publish=False)
    candidate = await make_candidate(client)

    listed = await client.get("/jobs", headers=candidate["auth"])
    asked_for_drafts = await client.get(
        "/jobs", params={"status": "draft"}, headers=candidate["auth"]
    )

    assert [job["id"] for job in listed.json()["items"]] == [published["id"]]
    assert asked_for_drafts.json()["total"] == 0
    assert (await client.get(f"/jobs/{draft['id']}", headers=candidate["auth"])).status_code == 404
    # The recruiter sees both.
    assert (await client.get("/jobs")).json()["total"] == 2


async def test_a_candidate_cannot_see_another_candidates_data(client: AsyncClient) -> None:
    """Someone else's profile or application is a 404, exactly like one that does not
    exist — a 403 would confirm the id is real."""
    job = await make_job(client)
    me, other = await make_candidate(client), await make_candidate(client)
    theirs = (await apply(client, job, other)).json()

    for url in (
        f"/candidates/{other['id']}",
        f"/applications/{theirs['id']}",
        f"/applications/{theirs['id']}/history",
        f"/applications/{theirs['id']}/notifications",
    ):
        response = await client.get(url, headers=me["auth"])
        assert response.status_code == 404, url

    edit = await client.patch(
        f"/candidates/{other['id']}", json={"full_name": "Hijacked"}, headers=me["auth"]
    )
    withdraw = await client.delete(f"/applications/{theirs['id']}", headers=me["auth"])
    assert edit.status_code == withdraw.status_code == 404
    assert (await client.get(f"/candidates/{other['id']}")).json()["full_name"] != "Hijacked"


async def test_the_recruiters_score_and_notes_are_not_shown_to_the_candidate(
    client: AsyncClient,
) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    url = f"/applications/{application['id']}"
    await client.post(f"{url}/stage", json={"stage": "rejected", "note": "Salary too high"})

    as_recruiter = (await client.get(url)).json()
    as_candidate = (await client.get(url, headers=candidate["auth"])).json()
    listed = (await client.get("/applications", headers=candidate["auth"])).json()["items"]
    history = (await client.get(f"{url}/history", headers=candidate["auth"])).json()

    assert as_recruiter["match_score"] is not None
    assert as_candidate["match_score"] is None
    assert listed[0]["match_score"] is None
    assert [change["to_stage"] for change in history] == ["applied", "rejected"]
    assert all(change["note"] is None for change in history)
    recruiter_history = (await client.get(f"{url}/history")).json()
    assert recruiter_history[-1]["note"] == "Salary too high"


async def test_a_job_you_applied_to_stays_readable_after_it_closes(client: AsyncClient) -> None:
    job = await make_job(client)
    applicant, bystander = await make_candidate(client), await make_candidate(client)
    await apply(client, job, applicant)
    await client.post(f"/jobs/{job['id']}/close")
    url = f"/jobs/{job['id']}"

    assert (await client.get(url, headers=applicant["auth"])).json()["status"] == "closed"
    assert (await client.get(url, headers=bystander["auth"])).status_code == 404
    # Reopened, it is a draft again — hidden from everyone until it is published.
    await client.post(f"{url}/reopen")
    assert (await client.get(url, headers=applicant["auth"])).status_code == 404


async def test_a_candidate_lists_only_their_own_applications(client: AsyncClient) -> None:
    job = await make_job(client)
    me, other = await make_candidate(client), await make_candidate(client)
    mine = (await apply(client, job, me)).json()
    await apply(client, job, other)

    listed = await client.get("/applications", headers=me["auth"])
    asked_for_theirs = await client.get(
        "/applications", params={"candidate_id": other["id"]}, headers=me["auth"]
    )

    assert [a["id"] for a in listed.json()["items"]] == [mine["id"]]
    assert asked_for_theirs.status_code == 403
    assert (await client.get(f"/candidates/{me['id']}", headers=me["auth"])).status_code == 200


async def test_the_applicant_is_whoever_the_token_names(client: AsyncClient) -> None:
    """A candidate_id in the body is ignored: it cannot be used to apply as someone else."""
    job = await make_job(client)
    me, other = await make_candidate(client), await make_candidate(client)

    response = await apply(client, job, me, candidate_id=other["id"])

    assert response.status_code == 201
    assert response.json()["candidate_id"] == me["id"]


async def test_a_recruiter_cannot_apply_or_withdraw(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    applied = await client.post(f"/jobs/{job['id']}/applications", json={})
    withdrawn = await client.delete(f"/applications/{application['id']}")
    staged = await client.post(
        f"/applications/{application['id']}/stage", json={"stage": "withdrawn"}
    )

    assert applied.status_code == withdrawn.status_code == staged.status_code == 403
    assert (await client.get(f"/applications/{application['id']}")).json()["stage"] == "applied"


# --- Recruiter accounts -------------------------------------------------------------------


async def test_the_cli_creates_a_recruiter_who_can_sign_in(engine, anonymous: AsyncClient) -> None:
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    created = await create_staff(
        sessions, "  Lead@Example.com", TEST_PASSWORD, "  Zara Malik ", exist_ok=False
    )
    repeated = await create_staff(
        sessions, "lead@example.com", "ignored-pw", "Ignored Name", exist_ok=True
    )

    assert created.startswith("Created recruiter lead@example.com")
    assert "already exists" in repeated
    tokens = (await sign_in(anonymous, "lead@example.com")).json()
    headers = bearer(tokens["access_token"])
    me = await anonymous.get("/auth/me", headers=headers)
    assert me.json()["role"] == "recruiter"
    # The profile came with the account, and --exist-ok renamed nobody.
    profile = await anonymous.get("/recruiters/me", headers=headers)
    assert profile.json()["full_name"] == "Zara Malik"


@pytest.mark.parametrize(
    ("email", "password", "name", "message"),
    [
        ("taken@example.com", TEST_PASSWORD, "Some One", "already exists (candidate)"),
        ("not-an-email", TEST_PASSWORD, "Some One", "Not a valid email"),
        ("new@example.com", "short", "Some One", "8 to 128 characters"),
        ("new@example.com", TEST_PASSWORD, "  A  ", "The name must be 2 to 160"),
    ],
    ids=["existing-candidate", "bad-email", "short-password", "short-name"],
)
async def test_the_cli_refuses(
    engine, client: AsyncClient, email: str, password: str, name: str, message: str
) -> None:
    """--exist-ok never promotes a candidate to recruiter, or resets anyone's password."""
    await make_candidate(client, email="taken@example.com")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    with pytest.raises(SystemExit, match=re.escape(message)):
        await create_staff(sessions, email, password, name, exist_ok=True)
