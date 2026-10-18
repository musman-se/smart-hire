"""Skills normalisation — one row per skill, shared by every job and candidate."""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.skills.models import Skill, job_skills
from tests.factories import make_candidate, make_job


async def test_a_skill_is_stored_once_however_many_rows_use_it(
    client: AsyncClient, session: AsyncSession
) -> None:
    await make_job(client, title="First Role", required_skills=["Python", "kafka"])
    await make_job(client, title="Second Role", required_skills=["python"])
    await make_candidate(client, skills=["PYTHON ", "docker"])

    names = (await session.scalars(select(Skill.name).order_by(Skill.name))).all()

    # Three jobs/candidates mention python in three spellings; the vocabulary holds one.
    assert names == ["docker", "kafka", "python"]


async def test_patch_replaces_the_skill_set(client: AsyncClient) -> None:
    job = await make_job(client, publish=False, required_skills=["python", "postgresql"])

    response = await client.patch(f"/jobs/{job['id']}", json={"required_skills": ["go"]})

    assert response.status_code == 200
    assert response.json()["required_skills"] == ["go"]
    # Re-fetched, not just echoed: the join table really changed.
    fetched = await client.get(f"/jobs/{job['id']}")
    assert fetched.json()["required_skills"] == ["go"]


async def test_deleting_a_job_removes_its_links_but_keeps_the_skill(
    client: AsyncClient, session: AsyncSession
) -> None:
    job = await make_job(client, required_skills=["rust"])

    await client.delete(f"/jobs/{job['id']}")

    links = await session.scalar(select(func.count()).select_from(job_skills))
    skill = await session.scalar(select(Skill).where(Skill.name == "rust"))
    assert links == 0  # ON DELETE CASCADE on job_skills.job_id
    assert skill is not None  # the vocabulary outlives any one job


async def test_the_database_refuses_an_unnormalised_skill_name(session: AsyncSession) -> None:
    """The API normalises names, but the check constraint is what guarantees it — for
    any writer, including a psql session or a future service."""
    session.add(Skill(name="Python"))

    with pytest.raises(IntegrityError, match="ck_skills_name_normalised"):
        await session.commit()
    await session.rollback()


async def test_an_over_long_skill_name_is_a_validation_error(client: AsyncClient) -> None:
    response = await client.post(
        "/jobs",
        json={
            "title": "Too Long Skill",
            "description": "A job listing an absurd skill name.",
            "required_skills": ["x" * 65],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_skill_filter_matches_through_the_join_table(client: AsyncClient) -> None:
    await make_candidate(client, full_name="Kafka Person", skills=["kafka", "python"])
    await make_candidate(client, full_name="Go Person", skills=["go"])

    response = await client.get("/candidates", params={"skill": "Kafka"})

    assert response.json()["total"] == 1
    assert response.json()["items"][0]["full_name"] == "Kafka Person"


async def test_list_skills_by_prefix(client: AsyncClient) -> None:
    await make_job(client, required_skills=["python", "postgresql", "pytest", "go"])

    response = await client.get("/skills", params={"search": "py"})

    assert response.status_code == 200
    assert [s["name"] for s in response.json()["items"]] == ["pytest", "python"]


async def test_skill_ids_are_generated_by_the_database(session: AsyncSession) -> None:
    """GENERATED ALWAYS AS IDENTITY: a client-supplied id is refused outright."""
    with pytest.raises(Exception, match="GENERATED ALWAYS"):
        await session.execute(text("INSERT INTO skills (id, name) VALUES (999, 'cobol')"))
    await session.rollback()
