"""Helpers that build test data through the API.

Going through HTTP rather than inserting rows directly means the fixtures exercise the
same validation as real traffic — a factory that can create an invalid job would let
tests pass on data the API would never accept.
"""

import uuid
from typing import Any

from httpx import AsyncClient


async def make_job(client: AsyncClient, *, publish: bool = True, **overrides: Any) -> dict:
    payload = {
        "title": "Senior Backend Engineer",
        "description": "Build and operate the SmartHire recruitment platform.",
        "required_skills": ["python", "postgresql"],
        "min_experience_years": 3,
    } | overrides

    response = await client.post("/jobs", json=payload)
    assert response.status_code == 201, response.text
    job = response.json()

    if publish:
        # 202: the workflow is started, not finished. The inline publisher used in the
        # tests finishes it before the response returns, so the job is published now.
        accepted = await client.post(f"/jobs/{job['id']}/publish")
        assert accepted.status_code == 202, accepted.text
        job = (await client.get(f"/jobs/{job['id']}")).json()
        assert job["status"] == "published", job

    return job


async def make_candidate(client: AsyncClient, **overrides: Any) -> dict:
    payload = {
        # Unique per call so the email uniqueness constraint never fires by accident.
        "email": f"candidate-{uuid.uuid4().hex[:12]}@example.com",
        "full_name": "Ayesha Khan",
        "years_experience": 5,
        "skills": ["python", "fastapi", "postgresql"],
    } | overrides

    response = await client.post("/candidates", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def apply(client: AsyncClient, job: dict, candidate: dict, **body: Any):
    return await client.post(
        f"/jobs/{job['id']}/applications",
        json={"candidate_id": candidate["id"], **body},
    )
