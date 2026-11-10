"""Recruiter profiles: one per recruiter account, read and changed by its owner.

`client` is signed in as the `recruiter` fixture, created the way the CLI creates one:
recruiter@example.com, "Sara Ahmed".
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.recruiters.models import Recruiter


async def test_a_recruiter_reads_their_own_profile(client: AsyncClient, recruiter: User) -> None:
    response = await client.get("/recruiters/me")

    assert response.status_code == 200
    profile = response.json()
    assert profile["id"] == str(recruiter.id)
    assert profile["email"] == "recruiter@example.com"
    assert profile["full_name"] == "Sara Ahmed"
    assert profile["title"] is None


async def test_a_recruiter_changes_their_name_and_title(client: AsyncClient) -> None:
    changed = await client.patch(
        "/recruiters/me", json={"full_name": "  Sara A. Ahmed ", "title": "Talent Partner"}
    )
    assert changed.status_code == 200
    assert changed.json()["full_name"] == "Sara A. Ahmed"
    assert changed.json()["title"] == "Talent Partner"

    # Only what is sent changes, and an emptied title is no title.
    cleared = await client.patch("/recruiters/me", json={"title": "  "})
    assert cleared.json()["title"] is None
    assert cleared.json()["full_name"] == "Sara A. Ahmed"

    assert (await client.get("/recruiters/me")).json() == cleared.json()


@pytest.mark.parametrize(
    "body",
    [{"full_name": None}, {"full_name": " A "}, {"full_name": "x" * 161}, {"title": "x" * 101}],
    ids=["null-name", "short-name", "long-name", "long-title"],
)
async def test_an_invalid_change_is_refused_before_the_database(
    client: AsyncClient, body: dict
) -> None:
    response = await client.patch("/recruiters/me", json=body)

    assert response.status_code == 422
    assert (await client.get("/recruiters/me")).json()["full_name"] == "Sara Ahmed"


async def test_an_account_has_at_most_one_recruiter_profile(
    session: AsyncSession, recruiter: User
) -> None:
    """The primary key is the account's id, so a second profile repeats it."""
    session.add(Recruiter(id=recruiter.id, full_name="Second Profile"))

    with pytest.raises(IntegrityError, match="pk_recruiters"):
        await session.commit()


async def test_a_profile_cannot_exist_without_an_account(session: AsyncSession) -> None:
    session.add(Recruiter(id=uuid.uuid4(), full_name="Nobody"))

    with pytest.raises(IntegrityError, match="fk_recruiters_id_users"):
        await session.commit()


async def test_deleting_the_account_deletes_the_profile(
    session: AsyncSession, recruiter: User
) -> None:
    await session.execute(delete(User).where(User.id == recruiter.id))
    await session.commit()

    assert await session.scalar(select(Recruiter).where(Recruiter.id == recruiter.id)) is None
