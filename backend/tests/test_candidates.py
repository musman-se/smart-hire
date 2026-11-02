"""Candidate API behaviour: registering, and a candidate's own profile."""

from httpx import AsyncClient

from tests.factories import TEST_PASSWORD, make_candidate


async def test_register_candidate(anonymous: AsyncClient) -> None:
    response = await anonymous.post(
        "/auth/register",
        json={
            "email": "  Ayesha.Khan@Example.COM ",
            "full_name": "Ayesha Khan",
            "years_experience": 6,
            "skills": ["Python", "Kafka"],
            "password": TEST_PASSWORD,
        },
    )

    assert response.status_code == 201
    candidate = response.json()
    # Normalised on the way in, so uniqueness is effectively case-insensitive.
    assert candidate["email"] == "ayesha.khan@example.com"
    assert candidate["skills"] == ["kafka", "python"]
    assert "password" not in candidate


async def test_duplicate_email_is_rejected(anonymous: AsyncClient) -> None:
    await make_candidate(anonymous, email="taken@example.com")

    response = await anonymous.post(
        "/auth/register",
        json={"email": "TAKEN@example.com", "full_name": "Someone Else", "password": TEST_PASSWORD},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_email"


async def test_invalid_email_is_rejected_before_the_database(anonymous: AsyncClient) -> None:
    response = await anonymous.post(
        "/auth/register",
        json={"email": "not-an-email", "full_name": "Ayesha Khan", "password": TEST_PASSWORD},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_email_cannot_be_changed_by_patch(client: AsyncClient) -> None:
    candidate = await make_candidate(client, email="original@example.com")

    response = await client.patch(
        f"/candidates/{candidate['id']}",
        json={"email": "hijacked@example.com", "full_name": "Ayesha K"},
        headers=candidate["auth"],
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


async def test_deleting_your_account_removes_the_profile_and_the_sign_in(
    client: AsyncClient,
) -> None:
    candidate = await make_candidate(client, email="leaving@example.com")

    deleted = await client.delete(f"/candidates/{candidate['id']}", headers=candidate["auth"])

    assert deleted.status_code == 204
    assert (await client.get(f"/candidates/{candidate['id']}")).status_code == 404
    # The account went too: the old token names no one, and the password opens nothing.
    assert (await client.get("/auth/me", headers=candidate["auth"])).status_code == 401
    login = await client.post(
        "/auth/login", json={"email": "leaving@example.com", "password": TEST_PASSWORD}
    )
    assert login.status_code == 401


async def test_patch_null_is_refused_for_required_fields_but_allowed_for_optional_ones(
    client: AsyncClient,
) -> None:
    candidate = await make_candidate(client, headline="Backend engineer")
    url = f"/candidates/{candidate['id']}"

    required = await client.patch(url, json={"full_name": None}, headers=candidate["auth"])
    optional = await client.patch(url, json={"headline": None}, headers=candidate["auth"])

    assert required.status_code == 422
    assert "full_name cannot be null" in required.json()["error"]["message"]
    assert optional.status_code == 200
    assert optional.json()["headline"] is None
