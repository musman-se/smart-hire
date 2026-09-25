"""Job API behaviour."""

import uuid

from httpx import AsyncClient

from tests.factories import make_job


async def test_create_job_starts_as_draft(client: AsyncClient) -> None:
    response = await client.post(
        "/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Build the SmartHire platform backend.",
            "required_skills": ["Python", " FastAPI ", "python"],
            "min_experience_years": 2,
        },
    )

    assert response.status_code == 201
    job = response.json()
    assert job["status"] == "draft"
    assert job["published_at"] is None
    # Skills are trimmed, lowercased and de-duplicated by the schema validator.
    assert job["required_skills"] == ["python", "fastapi"]


async def test_client_cannot_create_an_already_published_job(client: AsyncClient) -> None:
    """status is not part of JobCreate, so sending it is ignored rather than honoured."""
    response = await client.post(
        "/jobs",
        json={
            "title": "Sneaky Job",
            "description": "Trying to skip the publishing transition.",
            "status": "published",
        },
    )

    assert response.status_code == 201
    assert response.json()["status"] == "draft"


async def test_publish_sets_status_and_timestamp(client: AsyncClient) -> None:
    job = await make_job(client, publish=False)
    assert job["status"] == "draft"

    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 200
    published = response.json()
    assert published["status"] == "published"
    assert published["published_at"] is not None


async def test_publishing_twice_is_idempotent(client: AsyncClient) -> None:
    job = await make_job(client)

    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 200
    assert response.json()["status"] == "published"


async def test_closed_job_cannot_be_edited(client: AsyncClient) -> None:
    job = await make_job(client)
    await client.post(f"/jobs/{job['id']}/close")

    response = await client.patch(f"/jobs/{job['id']}", json={"title": "New title entirely"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "job_not_open"


async def test_patch_leaves_unsent_fields_alone(client: AsyncClient) -> None:
    job = await make_job(client, publish=False, department="Engineering")

    response = await client.patch(f"/jobs/{job['id']}", json={"title": "Staff Backend Engineer"})

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Staff Backend Engineer"
    assert updated["department"] == "Engineering"  # untouched, not reset to null


async def test_unknown_job_returns_structured_404(client: AsyncClient) -> None:
    response = await client.get(f"/jobs/{uuid.uuid4()}")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]  # correlates with the server log line


async def test_validation_error_uses_the_same_envelope(client: AsyncClient) -> None:
    response = await client.post("/jobs", json={"title": "no", "description": "short"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_list_filters_by_status_and_skill(client: AsyncClient) -> None:
    await make_job(client, title="Published Python Role", required_skills=["python"])
    await make_job(client, publish=False, title="Draft Go Role", required_skills=["go"])

    published = await client.get("/jobs", params={"status": "published"})
    by_skill = await client.get("/jobs", params={"skill": "go"})

    assert published.json()["total"] == 1
    assert published.json()["items"][0]["title"] == "Published Python Role"
    assert by_skill.json()["total"] == 1
    assert by_skill.json()["items"][0]["title"] == "Draft Go Role"


async def test_pagination_reports_total_beyond_the_page(client: AsyncClient) -> None:
    for index in range(3):
        await make_job(client, title=f"Role number {index}")

    response = await client.get("/jobs", params={"limit": 2, "offset": 0})

    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] == 3  # total describes the filter, not the page


async def test_limit_above_the_ceiling_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/jobs", params={"limit": 5000})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
