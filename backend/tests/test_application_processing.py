"""What happens after applying — scoring and the confirmation — with the activities
run inline. The workflow itself runs on a real server in test_application_workflow.py."""

from httpx import AsyncClient

from tests.factories import apply, make_candidate, make_job
from tests.fakes import InlineApplicationProcessor


async def _notifications(client: AsyncClient, application_id: str) -> list[dict]:
    return (await client.get(f"/applications/{application_id}/notifications")).json()


async def _score(client: AsyncClient, application_id: str) -> float | None:
    return (await client.get(f"/applications/{application_id}")).json()["match_score"]


async def test_applying_scores_the_application_and_confirms_it(client: AsyncClient) -> None:
    job = await make_job(client, title="Data Engineer", min_experience_years=0)
    candidate = await make_candidate(client, email="ayesha@example.com")

    application = (await apply(client, job, candidate)).json()

    assert await _score(client, application["id"]) == 100.0
    notifications = await _notifications(client, application["id"])
    assert len(notifications) == 1
    assert notifications[0]["recipient"] == "ayesha@example.com"
    assert notifications[0]["subject"] == "We received your application: Data Engineer"


async def test_a_stronger_candidate_scores_higher(client: AsyncClient) -> None:
    job = await make_job(client, required_skills=["python", "postgresql"], min_experience_years=4)
    strong = await make_candidate(client, skills=["python", "postgresql"], years_experience=6)
    weak = await make_candidate(client, skills=["python"], years_experience=4)

    strong_app = (await apply(client, job, strong)).json()
    weak_app = (await apply(client, job, weak)).json()

    assert await _score(client, strong_app["id"]) > await _score(client, weak_app["id"])


async def test_the_confirmation_is_sent_once_however_often_the_activity_runs(
    client: AsyncClient, processor: InlineApplicationProcessor
) -> None:
    """Temporal runs activities at least once. The dedupe key makes a second run a no-op
    instead of a second email."""
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    again = await processor.activities.send_application_received(application["id"])

    assert again is False
    assert len(await _notifications(client, application["id"])) == 1


async def test_an_engine_outage_does_not_fail_the_application(
    client: AsyncClient, processor: InlineApplicationProcessor
) -> None:
    """The application is committed before processing starts. If Temporal is down the
    candidate still gets their 201; processing is recovered later."""
    job = await make_job(client)
    candidate = await make_candidate(client)
    processor.available = False

    response = await apply(client, job, candidate)

    assert response.status_code == 201
    application_id = response.json()["id"]
    assert await _score(client, application_id) is None

    # Recovery, once the engine is back.
    processor.available = True
    recovered = await client.post(f"/applications/{application_id}/process")

    assert recovered.status_code == 202
    assert await _score(client, application_id) is not None
    assert len(await _notifications(client, application_id)) == 1


async def test_reprocessing_is_safe_to_repeat(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    score = await _score(client, application["id"])

    for _ in range(2):
        await client.post(f"/applications/{application['id']}/process")

    assert await _score(client, application["id"]) == score
    assert len(await _notifications(client, application["id"])) == 1


async def test_reprocessing_needs_the_engine(
    client: AsyncClient, processor: InlineApplicationProcessor
) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()
    processor.available = False

    response = await client.post(f"/applications/{application['id']}/process")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "workflow_unavailable"
