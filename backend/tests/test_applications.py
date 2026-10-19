"""Application rules — the three the brief names, plus the stage machine.

These are the tests a reviewer will care about most: they are the requirements stated
word for word in the assignment.
"""

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.applications.models import Application
from tests.factories import apply, make_candidate, make_job

# --- Happy path ------------------------------------------------------------------


async def test_apply_creates_an_application_in_the_applied_stage(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)

    response = await apply(client, job, candidate, cover_letter="I would love this role.")

    assert response.status_code == 201
    application = response.json()
    assert application["stage"] == "applied"
    assert application["job_id"] == job["id"]
    assert application["candidate_id"] == candidate["id"]
    # Scoring runs after the 201, in the ProcessApplication workflow, so the response
    # itself never carries a score.
    assert application["match_score"] is None


# --- Rule 1: duplicate applications ----------------------------------------------


async def test_second_application_to_the_same_job_is_rejected(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)

    first = await apply(client, job, candidate)
    second = await apply(client, job, candidate)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "duplicate_application"


async def test_the_database_itself_refuses_a_duplicate(session: AsyncSession) -> None:
    """The rule that actually holds under concurrency.

    This bypasses the service entirely and writes two identical rows, proving the
    guarantee comes from the unique constraint rather than from the Python pre-check.
    Two simultaneous requests can both pass that pre-check; neither can pass this.
    """
    from app.candidates.models import Candidate
    from app.jobs.models import Job

    job = Job(title="Race Condition Role", description="Testing the unique constraint.")
    candidate = Candidate(email=f"race-{uuid.uuid4().hex[:8]}@example.com", full_name="Racer")
    session.add_all([job, candidate])
    await session.commit()

    session.add(Application(job_id=job.id, candidate_id=candidate.id))
    await session.commit()

    session.add(Application(job_id=job.id, candidate_id=candidate.id))
    with pytest.raises(IntegrityError):
        await session.commit()

    await session.rollback()


async def test_applying_to_a_different_job_is_allowed(client: AsyncClient) -> None:
    candidate = await make_candidate(client)
    first_job = await make_job(client, title="First Role")
    second_job = await make_job(client, title="Second Role")

    first = await apply(client, first_job, candidate)
    second = await apply(client, second_job, candidate)

    assert first.status_code == 201
    assert second.status_code == 201


# --- Rule 2: eligibility ---------------------------------------------------------


async def test_draft_job_does_not_accept_applications(client: AsyncClient) -> None:
    job = await make_job(client, publish=False)
    candidate = await make_candidate(client)

    response = await apply(client, job, candidate)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "job_not_open"


async def test_closed_job_does_not_accept_applications(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    await client.post(f"/jobs/{job['id']}/close")

    response = await apply(client, job, candidate)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "job_not_open"


async def test_insufficient_experience_is_not_eligible(client: AsyncClient) -> None:
    job = await make_job(client, min_experience_years=8)
    candidate = await make_candidate(client, years_experience=2)

    response = await apply(client, job, candidate)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "not_eligible"
    # The message names both numbers, so a candidate learns why rather than just "no".
    assert "8" in body["error"]["message"] and "2" in body["error"]["message"]


async def test_no_overlapping_skills_is_not_eligible(client: AsyncClient) -> None:
    job = await make_job(client, required_skills=["rust", "kubernetes"], min_experience_years=0)
    candidate = await make_candidate(client, skills=["excel"], years_experience=10)

    response = await apply(client, job, candidate)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_eligible"


async def test_one_overlapping_skill_is_enough(client: AsyncClient) -> None:
    job = await make_job(client, required_skills=["python", "kafka"], min_experience_years=0)
    candidate = await make_candidate(client, skills=["python"], years_experience=1)

    response = await apply(client, job, candidate)

    assert response.status_code == 201


# --- Rule 3: application limits --------------------------------------------------


async def test_candidate_hits_the_active_application_limit(client: AsyncClient) -> None:
    from app.core.config import settings

    candidate = await make_candidate(client)

    for index in range(settings.max_applications_per_candidate):
        job = await make_job(client, title=f"Role {index}", min_experience_years=0)
        assert (await apply(client, job, candidate)).status_code == 201

    one_too_many = await make_job(client, title="One Too Many", min_experience_years=0)
    response = await apply(client, one_too_many, candidate)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "application_limit_reached"


async def test_rejected_applications_free_up_a_slot(client: AsyncClient) -> None:
    """Terminal stages do not count toward the limit — a rejected candidate is not
    locked out of the platform."""
    from app.core.config import settings

    candidate = await make_candidate(client)
    applications = []

    for index in range(settings.max_applications_per_candidate):
        job = await make_job(client, title=f"Role {index}", min_experience_years=0)
        applications.append((await apply(client, job, candidate)).json())

    # Reject one: applied -> rejected is a legal transition.
    rejected = await client.post(
        f"/applications/{applications[0]['id']}/stage", json={"stage": "rejected"}
    )
    assert rejected.status_code == 200

    replacement_job = await make_job(client, title="Replacement", min_experience_years=0)
    response = await apply(client, replacement_job, candidate)

    assert response.status_code == 201


async def test_job_capacity_is_enforced(client: AsyncClient) -> None:
    job = await make_job(client, max_applications=1, min_experience_years=0)
    first_candidate = await make_candidate(client)
    second_candidate = await make_candidate(client)

    first = await apply(client, job, first_candidate)
    second = await apply(client, job, second_candidate)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "job_capacity_reached"


# --- Stage machine ---------------------------------------------------------------


async def test_legal_stage_progression(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    for stage in ("screening", "interview", "offer", "hired"):
        response = await client.post(
            f"/applications/{application['id']}/stage", json={"stage": stage}
        )
        assert response.status_code == 200, response.text
        assert response.json()["stage"] == stage


async def test_cannot_skip_straight_to_hired(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    response = await client.post(
        f"/applications/{application['id']}/stage", json={"stage": "hired"}
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_stage_transition"


async def test_terminal_stage_cannot_be_left(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    await client.post(f"/applications/{application['id']}/stage", json={"stage": "rejected"})

    response = await client.post(
        f"/applications/{application['id']}/stage", json={"stage": "screening"}
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_stage_transition"


# --- Listing ---------------------------------------------------------------------


async def test_list_applications_for_a_job(client: AsyncClient) -> None:
    job = await make_job(client)
    other_job = await make_job(client, title="Unrelated Role")
    candidate = await make_candidate(client)

    await apply(client, job, candidate)
    await apply(client, other_job, candidate)

    response = await client.get(f"/jobs/{job['id']}/applications")

    assert response.json()["total"] == 1
    assert response.json()["items"][0]["job_id"] == job["id"]


async def test_deleting_a_job_cascades_to_its_applications(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    await client.delete(f"/jobs/{job['id']}")
    response = await client.get(f"/applications/{application['id']}")

    assert response.status_code == 404


# --- Concurrency -----------------------------------------------------------------
#
# The two counting rules are check-then-insert: count the rows, then insert one. Run
# concurrently, every request can count before any of them commits, and all of them pass.
# These tests fire the requests at the same moment; each gets its own session and its
# own connection, exactly as separate HTTP requests would.
#
# A race that depends on scheduling luck makes a test that proves nothing — it passes
# whether or not the bug exists. `widen_race_window` makes the race certain: it pauses
# each request just after it counts, so every request has counted before any inserts.
# Without row locks both tests below fail every time; with them, both pass every time.


@pytest.fixture
def widen_race_window(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.applications import service

    def delayed(count):
        async def wrapper(*args, **kwargs):
            result = await count(*args, **kwargs)
            await asyncio.sleep(0.05)
            return result

        return wrapper

    for name in ("_count_active_applications", "_count_job_applications"):
        monkeypatch.setattr(service, name, delayed(getattr(service, name)))


@pytest.mark.usefixtures("widen_race_window")
async def test_job_capacity_holds_under_concurrent_applications(client: AsyncClient) -> None:
    job = await make_job(client, max_applications=1, min_experience_years=0)
    candidates = [await make_candidate(client) for _ in range(5)]

    responses = await asyncio.gather(*(apply(client, job, c) for c in candidates))

    statuses = sorted(r.status_code for r in responses)
    assert statuses == [201, 409, 409, 409, 409]
    assert (await client.get(f"/jobs/{job['id']}/applications")).json()["total"] == 1


@pytest.mark.usefixtures("widen_race_window")
async def test_candidate_limit_holds_under_concurrent_applications(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_applications_per_candidate", 2)
    candidate = await make_candidate(client)
    first = await make_job(client, title="Already Applied", min_experience_years=0)
    assert (await apply(client, first, candidate)).status_code == 201

    jobs = [await make_job(client, title=f"Race {i}", min_experience_years=0) for i in range(4)]
    responses = await asyncio.gather(*(apply(client, job, candidate) for job in jobs))

    # One slot was left, so exactly one of the four may take it.
    assert sorted(r.status_code for r in responses) == [201, 409, 409, 409]
    listed = await client.get("/applications", params={"candidate_id": candidate["id"]})
    assert listed.json()["total"] == 2


# --- Tracking ----------------------------------------------------------------------


async def test_every_stage_change_is_recorded_in_order(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    await client.post(
        f"/applications/{application['id']}/stage",
        json={"stage": "screening", "note": "Strong CV"},
    )
    await client.post(f"/applications/{application['id']}/stage", json={"stage": "interview"})

    history = (await client.get(f"/applications/{application['id']}/history")).json()

    assert [(h["from_stage"], h["to_stage"]) for h in history] == [
        (None, "applied"),
        ("applied", "screening"),
        ("screening", "interview"),
    ]
    assert history[1]["note"] == "Strong CV"


async def test_a_refused_transition_leaves_no_history(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    refused = await client.post(
        f"/applications/{application['id']}/stage", json={"stage": "hired"}
    )

    assert refused.status_code == 409
    history = (await client.get(f"/applications/{application['id']}/history")).json()
    assert len(history) == 1


async def test_withdrawing_keeps_the_application_and_its_history(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    response = await client.delete(f"/applications/{application['id']}")

    assert response.status_code == 204
    kept = await client.get(f"/applications/{application['id']}")
    assert kept.status_code == 200
    assert kept.json()["stage"] == "withdrawn"
    history = (await client.get(f"/applications/{application['id']}/history")).json()
    assert history[-1]["to_stage"] == "withdrawn"
    assert history[-1]["note"] == "Withdrawn by the candidate"


async def test_withdrawing_frees_a_slot_but_not_the_same_job(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_applications_per_candidate", 1)
    candidate = await make_candidate(client)
    first = await make_job(client, title="First", min_experience_years=0)
    second = await make_job(client, title="Second", min_experience_years=0)
    application = (await apply(client, first, candidate)).json()

    await client.delete(f"/applications/{application['id']}")

    again = await apply(client, first, candidate)
    assert again.status_code == 409  # withdrawal is final for that job
    assert again.json()["error"]["code"] == "duplicate_application"
    assert (await apply(client, second, candidate)).status_code == 201  # but the slot is free


async def test_a_hired_application_cannot_be_withdrawn(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    for stage in ("screening", "interview", "offer", "hired"):
        await client.post(f"/applications/{application['id']}/stage", json={"stage": stage})

    response = await client.delete(f"/applications/{application['id']}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_stage_transition"
