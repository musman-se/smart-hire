"""Idempotency keys — a retried request gets the original answer, once.

Needs Redis: `docker compose up -d redis`.
"""

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from redis.asyncio import Redis

from app.core.idempotency import IdempotencyStore, get_idempotency_store
from app.main import app
from tests.factories import make_candidate, make_job

pytestmark = pytest.mark.usefixtures("redis_available")


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def test_a_retried_application_gets_the_original_201(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    headers = key()
    body = {"candidate_id": candidate["id"]}

    first = await client.post(f"/jobs/{job['id']}/applications", json=body, headers=headers)
    retry = await client.post(f"/jobs/{job['id']}/applications", json=body, headers=headers)

    assert first.status_code == retry.status_code == 201
    assert retry.json() == first.json()
    assert retry.headers["Idempotent-Replayed"] == "true"
    listed = await client.get(f"/jobs/{job['id']}/applications")
    assert listed.json()["total"] == 1


async def test_without_a_key_the_retry_is_refused_as_a_duplicate(client: AsyncClient) -> None:
    """The contrast: duplicate prevention protects the data, but tells a client whose
    first request succeeded that it failed."""
    job = await make_job(client)
    candidate = await make_candidate(client)
    body = {"candidate_id": candidate["id"]}

    await client.post(f"/jobs/{job['id']}/applications", json=body)
    retry = await client.post(f"/jobs/{job['id']}/applications", json=body)

    assert retry.status_code == 409
    assert retry.json()["error"]["code"] == "duplicate_application"


async def test_a_retried_job_creation_creates_one_job(client: AsyncClient) -> None:
    headers = key()
    body = {"title": "Idempotent Role", "description": "Created exactly once, however often sent."}

    responses = [await client.post("/jobs", json=body, headers=headers) for _ in range(3)]

    assert {r.json()["id"] for r in responses} == {responses[0].json()["id"]}
    assert (await client.get("/jobs", params={"search": "Idempotent"})).json()["total"] == 1


async def test_reusing_a_key_for_a_different_body_is_refused(client: AsyncClient) -> None:
    headers = key()

    await client.post(
        "/jobs", json={"title": "First Role", "description": "The first."}, headers=headers
    )
    misuse = await client.post(
        "/jobs", json={"title": "Second Role", "description": "Not the first."}, headers=headers
    )

    assert misuse.status_code == 422
    assert misuse.json()["error"]["code"] == "idempotency_key_reused"


async def test_a_business_refusal_is_replayed_too(client: AsyncClient) -> None:
    """A 4xx is a real answer: the retry hears the same one, without re-running."""
    job = await make_job(client, publish=False)
    candidate = await make_candidate(client)
    headers = key()
    body = {"candidate_id": candidate["id"]}

    first = await client.post(f"/jobs/{job['id']}/applications", json=body, headers=headers)
    retry = await client.post(f"/jobs/{job['id']}/applications", json=body, headers=headers)

    assert first.status_code == retry.status_code == 409
    assert retry.json()["error"]["code"] == "job_not_open"
    assert retry.headers["Idempotent-Replayed"] == "true"


async def test_concurrent_requests_with_one_key_run_the_action_once(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    headers = key()
    body = {"candidate_id": candidate["id"]}

    responses = await asyncio.gather(
        *(
            client.post(f"/jobs/{job['id']}/applications", json=body, headers=headers)
            for _ in range(4)
        )
    )

    # Exactly one ran. The others either waited it out and were replayed (201), or
    # arrived while it was running (409 idempotency_in_progress) — never a duplicate.
    codes = {r.json().get("error", {}).get("code") for r in responses if r.status_code == 409}
    assert codes <= {"idempotency_in_progress"}
    assert (await client.get(f"/jobs/{job['id']}/applications")).json()["total"] == 1


async def test_redis_down_fails_open(client: AsyncClient) -> None:
    """Idempotency is a second line of defence. With Redis unreachable the request runs
    unprotected, and the database constraints still refuse duplicates."""
    dead = Redis.from_url("redis://localhost:1/0", socket_timeout=0.2, socket_connect_timeout=0.2)
    app.dependency_overrides[get_idempotency_store] = lambda: IdempotencyStore(
        dead, ttl_seconds=60, lock_seconds=60
    )

    response = await client.post(
        "/jobs", json={"title": "Created Anyway", "description": "Redis is down."}, headers=key()
    )

    assert response.status_code == 201
    await dead.aclose()
