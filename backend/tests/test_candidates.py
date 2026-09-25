"""Candidate API behaviour."""

from httpx import AsyncClient

from tests.factories import make_candidate


async def test_register_candidate(client: AsyncClient) -> None:
    response = await client.post(
        "/candidates",
        json={
            "email": "  Ayesha.Khan@Example.COM ",
            "full_name": "Ayesha Khan",
            "years_experience": 6,
            "skills": ["Python", "Kafka"],
        },
    )

    assert response.status_code == 201
    candidate = response.json()
    # Normalised on the way in, so uniqueness is effectively case-insensitive.
    assert candidate["email"] == "ayesha.khan@example.com"
    assert candidate["skills"] == ["python", "kafka"]


async def test_duplicate_email_is_rejected(client: AsyncClient) -> None:
    await make_candidate(client, email="taken@example.com")

    response = await client.post(
        "/candidates",
        json={"email": "taken@example.com", "full_name": "Someone Else"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_email"


async def test_invalid_email_is_rejected_before_the_database(client: AsyncClient) -> None:
    response = await client.post(
        "/candidates",
        json={"email": "not-an-email", "full_name": "Ayesha Khan"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_email_cannot_be_changed_by_patch(client: AsyncClient) -> None:
    candidate = await make_candidate(client, email="original@example.com")

    response = await client.patch(
        f"/candidates/{candidate['id']}",
        json={"email": "hijacked@example.com", "full_name": "Ayesha K"},
    )

    assert response.status_code == 200
    # email is absent from CandidateUpdate, so it is ignored rather than applied.
    assert response.json()["email"] == "original@example.com"
    assert response.json()["full_name"] == "Ayesha K"


async def test_filter_by_skill_and_experience(client: AsyncClient) -> None:
    await make_candidate(client, full_name="Kafka Person", skills=["kafka"], years_experience=9)
    await make_candidate(client, full_name="Python Person", skills=["python"], years_experience=1)

    by_skill = await client.get("/candidates", params={"skill": "kafka"})
    by_experience = await client.get("/candidates", params={"min_experience": 5})

    assert by_skill.json()["total"] == 1
    assert by_skill.json()["items"][0]["full_name"] == "Kafka Person"
    assert by_experience.json()["total"] == 1


async def test_deleting_a_candidate_removes_them(client: AsyncClient) -> None:
    candidate = await make_candidate(client)

    deleted = await client.delete(f"/candidates/{candidate['id']}")
    fetched = await client.get(f"/candidates/{candidate['id']}")

    assert deleted.status_code == 204
    assert fetched.status_code == 404
