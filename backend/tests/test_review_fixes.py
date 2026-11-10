"""Regressions for the whole-app review (fix/whole-app-review).

Each test names the problem it closes. Most went through the API like any client; a few
call a service or an activity directly where only that can stage the race or failure.
`client` is signed in as the recruiter fixture.
"""

import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from temporalio.exceptions import ApplicationError
from temporalio.service import RPCError, RPCStatusCode

from app.applications.activities import ApplicationActivities
from app.applications.models import Application
from app.candidates.models import Candidate
from app.core.config import Settings
from app.core.temporal import WorkflowStartUnknownError
from app.jobs.models import Job
from app.main import app
from app.notifications.models import Notification
from app.publishing.activities import MarkFailedInput, PublishingActivities
from app.publishing.models import job_extracted_skills
from app.publishing.publisher import TemporalJobPublisher
from app.publishing.workflow import failure_reason
from app.skills.models import Skill
from tests.factories import TEST_PASSWORD, apply, make_candidate, make_job
from tests.fakes import InlineApplicationProcessor, InlineJobPublisher

JWT_KEY = "x" * 40


# --- Input and reads -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "/jobs?search=a%00b",
        "/jobs?skill=a%00b",
        "/skills?search=a%00b",
        "/candidates?search=a%00b",
        "/candidates?skill=a%00b",
    ],
)
async def test_a_nul_in_a_query_parameter_is_a_422_not_a_500(client: AsyncClient, url: str) -> None:
    response = await client.get(url)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_wildcards_in_a_search_match_themselves(client: AsyncClient) -> None:
    await make_job(client, title="Data_Lake Engineer", publish=False)
    await make_job(client, title="DataXLake Engineer", publish=False)

    found = (await client.get("/jobs", params={"search": "a_l"})).json()
    everything = (await client.get("/jobs", params={"search": "%"})).json()

    assert [job["title"] for job in found["items"]] == ["Data_Lake Engineer"]
    assert everything["total"] == 0


async def test_a_row_outside_todays_input_rules_still_lists(
    client: AsyncClient, session: AsyncSession
) -> None:
    """Read models used to re-apply the input rules: one stored row past a cap turned
    every list containing it into a 500."""
    candidate = await make_candidate(client)
    job = await make_job(client, publish=False)
    await session.execute(
        update(Candidate)
        .where(Candidate.id == uuid.UUID(candidate["id"]))
        .values(years_experience=61)
    )
    await session.execute(
        update(Job).where(Job.id == uuid.UUID(job["id"])).values(min_experience_years=51)
    )
    await session.commit()

    assert (await client.get("/candidates")).status_code == 200
    assert (await client.get("/jobs")).status_code == 200


async def test_concurrent_profile_saves_all_succeed(client: AsyncClient) -> None:
    """Unlocked, two saves adding the same skill both inserted it: one 500."""
    candidate = await make_candidate(client)
    url = f"/candidates/{candidate['id']}"

    responses = await asyncio.gather(
        *(
            client.patch(url, json={"skills": ["python", "rust"]}, headers=candidate["auth"])
            for _ in range(6)
        )
    )

    assert {response.status_code for response in responses} == {200}
    assert (await client.get(url)).json()["skills"] == ["python", "rust"]


@pytest.mark.parametrize(
    "link", ["javascript:alert(1)", "data:text/html,hi", "drive.google.com/cv", "ftp://x.io/cv"]
)
async def test_a_resume_link_must_be_a_web_address(client: AsyncClient, link: str) -> None:
    candidate = await make_candidate(client)
    url = f"/candidates/{candidate['id']}"

    refused = await client.patch(url, json={"resume_url": link}, headers=candidate["auth"])
    accepted = await client.patch(
        url, json={"resume_url": " https://example.com/cv.pdf "}, headers=candidate["auth"]
    )

    assert refused.status_code == 422
    assert accepted.json()["resume_url"] == "https://example.com/cv.pdf"


async def test_a_blank_candidate_name_is_refused(
    anonymous: AsyncClient, client: AsyncClient
) -> None:
    registered = await anonymous.post(
        "/auth/register",
        json={"email": "blank@example.com", "full_name": "   ", "password": TEST_PASSWORD},
    )
    candidate = await make_candidate(client, full_name="  Ayesha Khan ")
    patched = await client.patch(
        f"/candidates/{candidate['id']}", json={"full_name": " \t "}, headers=candidate["auth"]
    )

    assert registered.status_code == 422
    assert candidate["full_name"] == "Ayesha Khan"
    assert patched.status_code == 422


async def test_skill_lists_are_capped(client: AsyncClient, anonymous: AsyncClient) -> None:
    skills = [f"skill-{n}" for n in range(51)]

    registered = await anonymous.post(
        "/auth/register",
        json={
            "email": "many@example.com",
            "full_name": "Many Skills",
            "password": TEST_PASSWORD,
            "skills": skills,
        },
    )
    created = await client.post(
        "/jobs",
        json={
            "title": "Generalist",
            "description": "Does a bit of everything.",
            "required_skills": skills,
        },
    )

    assert registered.status_code == created.status_code == 422
    assert (await client.get("/skills")).json()["total"] == 0


async def test_changing_only_skills_moves_updated_at(client: AsyncClient) -> None:
    candidate = await make_candidate(client)
    job = await make_job(client, publish=False)
    await asyncio.sleep(0.01)

    profile = await client.patch(
        f"/candidates/{candidate['id']}", json={"skills": ["go"]}, headers=candidate["auth"]
    )
    edited = await client.patch(f"/jobs/{job['id']}", json={"required_skills": ["go"]})

    assert profile.json()["updated_at"] > candidate["updated_at"]
    assert edited.json()["updated_at"] > job["updated_at"]

    # The same skills again, as an editor that sends every field would: nothing moves.
    again = await client.patch(f"/jobs/{job['id']}", json={"required_skills": ["Go"]})
    assert again.json()["updated_at"] == edited.json()["updated_at"]


async def test_the_skill_cap_counts_skills_after_duplicates_merge(client: AsyncClient) -> None:
    skills = [f"skill-{n}" for n in range(50)] + ["SKILL-0", " skill-1 ", "", "  "]

    created = await client.post(
        "/jobs",
        json={
            "title": "Generalist",
            "description": "Does a bit of everything.",
            "required_skills": skills,
        },
    )

    assert created.status_code == 201
    assert len(created.json()["required_skills"]) == 50


async def test_registration_and_sign_in_normalise_an_email_alike(anonymous: AsyncClient) -> None:
    """Registration stored EmailStr's normal form (a Unicode domain); sign-in only
    lowercased what was typed — so the exact string you registered with failed."""
    typed = "Noor@XN--BCHER-KVA.example"
    registered = await anonymous.post(
        "/auth/register",
        json={"email": typed, "full_name": "Noor Aziz", "password": TEST_PASSWORD},
    )

    signed_in = await anonymous.post(
        "/auth/login", json={"email": typed, "password": TEST_PASSWORD}
    )

    assert registered.status_code == 201
    assert signed_in.status_code == 200


# --- Applying and visibility ---------------------------------------------------------------


async def test_reapplying_is_reported_as_a_duplicate_first(
    client: AsyncClient, session: AsyncSession
) -> None:
    """The duplicate check used to come after eligibility and the caps, so a second
    application read as "job full" or "not eligible"."""
    job = await make_job(client, max_applications=1)
    candidate = await make_candidate(client)
    assert (await apply(client, job, candidate)).status_code == 201
    await session.execute(
        update(Job).where(Job.id == uuid.UUID(job["id"])).values(min_experience_years=40)
    )
    await session.commit()

    again = await apply(client, job, candidate)

    assert again.status_code == 409
    assert again.json()["error"]["code"] == "duplicate_application"


async def test_a_reopened_draft_stays_hidden_even_from_its_applicants(
    client: AsyncClient,
) -> None:
    """A job reopened as a draft may be rewritten for another role; nobody sees it until
    it is published again — and applying again must not confirm it exists either."""
    job = await make_job(client)
    applicant = await make_candidate(client)
    await apply(client, job, applicant)
    await client.post(f"/jobs/{job['id']}/close")
    await client.post(f"/jobs/{job['id']}/reopen")

    assert (await client.get(f"/jobs/{job['id']}", headers=applicant["auth"])).status_code == 404
    reapplied = await apply(client, job, applicant)
    assert reapplied.status_code == 404


async def test_candidates_never_see_publish_error(
    client: AsyncClient, session: AsyncSession
) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)
    await session.execute(
        update(Job)
        .where(Job.id == uuid.UUID(job["id"]))
        .values(publish_error="Refreshing the analysis failed: DataError: …")
    )
    await session.commit()

    one = (await client.get(f"/jobs/{job['id']}", headers=candidate["auth"])).json()
    listed = (await client.get("/jobs", headers=candidate["auth"])).json()["items"]
    as_recruiter = (await client.get(f"/jobs/{job['id']}")).json()

    assert one["publish_error"] is None
    assert all(item["publish_error"] is None for item in listed)
    assert as_recruiter["publish_error"].startswith("Refreshing")


async def test_the_applicants_of_an_unknown_job_are_404(client: AsyncClient) -> None:
    response = await client.get(f"/jobs/{uuid.uuid4()}/applications")

    assert response.status_code == 404


# --- Counts and batches ----------------------------------------------------------------------


async def test_counts_come_in_one_request_each(client: AsyncClient) -> None:
    open_job = await make_job(client)
    draft = await make_job(client, publish=False)
    first, second = await make_candidate(client), await make_candidate(client)
    application = (await apply(client, open_job, first)).json()
    await apply(client, open_job, second)
    await client.post(f"/applications/{application['id']}/stage", json={"stage": "screening"})

    statuses = (await client.get("/jobs/status-counts")).json()
    stages = (await client.get("/applications/stage-counts")).json()
    one_job = (
        await client.get("/applications/stage-counts", params={"job_id": open_job["id"]})
    ).json()
    per_job = (
        await client.get(
            "/applications/job-counts", params=[("job_id", open_job["id"]), ("job_id", draft["id"])]
        )
    ).json()

    assert statuses == {
        "draft": 1,
        "processing": 0,
        "published": 1,
        "publish_failed": 0,
        "closed": 0,
    }
    assert stages["applied"] == 1 and stages["screening"] == 1 and stages["hired"] == 0
    assert one_job == stages
    assert per_job == {open_job["id"]: 2, draft["id"]: 0}


@pytest.mark.parametrize(
    "path",
    [
        "/jobs/status-counts",
        "/applications/stage-counts",
        f"/applications/job-counts?job_id={uuid.uuid4()}",
    ],
)
async def test_counts_are_for_recruiters(client: AsyncClient, path: str) -> None:
    candidate = await make_candidate(client)

    assert (await client.get(path, headers=candidate["auth"])).status_code == 403


async def test_candidates_are_fetched_by_id_in_one_request(client: AsyncClient) -> None:
    wanted = [await make_candidate(client) for _ in range(3)]
    await make_candidate(client)  # not asked for

    page = (await client.get("/candidates", params=[("ids", c["id"]) for c in wanted])).json()

    assert page["total"] == 3
    assert {c["id"] for c in page["items"]} == {c["id"] for c in wanted}


# --- Requests and errors -----------------------------------------------------------------------


async def test_a_body_over_the_limit_is_refused_with_413(anonymous: AsyncClient) -> None:
    oversized = b'{"email": "' + b"a" * 1_100_000 + b'"}'

    declared = await anonymous.post(
        "/auth/login", content=oversized, headers={"Content-Type": "application/json"}
    )

    async def chunks():
        for start in range(0, len(oversized), 65536):
            yield oversized[start : start + 65536]

    streamed = await anonymous.post(
        "/auth/login", content=chunks(), headers={"Content-Type": "application/json"}
    )

    for response in (declared, streamed):
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "payload_too_large"


async def test_a_500_carries_its_request_id_header(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.jobs import service

    async def explode(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(service, "list_jobs", explode)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=client.headers
    ) as raw:
        failed = await raw.get("/jobs", headers={"X-Request-ID": "trace-500"})
        refused = await raw.get(f"/jobs/{uuid.uuid4()}", headers={"X-Request-ID": "trace-404"})

    assert failed.status_code == 500
    assert failed.headers.get_list("x-request-id") == ["trace-500"]
    # Error responses set it themselves; the middleware must not add a second copy.
    assert refused.headers.get_list("x-request-id") == ["trace-404"]


def test_production_refuses_sql_echo() -> None:
    with pytest.raises(ValidationError, match="DB_ECHO"):
        Settings(
            _env_file=None,
            environment="production",
            postgres_password="a-real-secret",
            jwt_secret_key=JWT_KEY,
            db_echo=True,
        )


# --- Publishing and processing -----------------------------------------------------------------


async def test_skills_candidates_typed_are_not_found_in_job_text(
    client: AsyncClient, session: AsyncSession
) -> None:
    """Extraction matched every row in `skills`, and any candidate can add rows: "the"
    and "team" became skills of every job published afterwards."""
    await make_candidate(client, skills=["the", "team", "python"])
    job = await make_job(
        client,
        description="Work with the team on our Python services and ship weekly.",
        required_skills=["python"],
    )

    found = set(
        await session.scalars(
            select(Skill.name)
            .join(job_extracted_skills, job_extracted_skills.c.skill_id == Skill.id)
            .where(job_extracted_skills.c.job_id == uuid.UUID(job["id"]))
        )
    )

    assert "python" in found
    assert not found & {"the", "team"}


async def test_an_unchanged_save_does_not_reanalyse_a_live_job(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client)
    starts = len(publisher.starts)

    await client.patch(
        f"/jobs/{job['id']}", json={"title": job["title"], "description": job["description"]}
    )
    assert len(publisher.starts) == starts

    await client.patch(f"/jobs/{job['id']}", json={"description": "A different description now."})
    assert len(publisher.starts) == starts + 1


async def test_a_failed_refresh_is_recorded_and_can_be_rerun(
    client: AsyncClient, publisher: InlineJobPublisher, monkeypatch: pytest.MonkeyPatch
) -> None:
    job = await make_job(client)
    real = publisher.activities.break_down_description

    async def broken(job_id: str):
        raise RuntimeError("analysis crashed")

    monkeypatch.setattr(publisher.activities, "break_down_description", broken)
    await client.patch(f"/jobs/{job['id']}", json={"description": "Rewritten from scratch today."})
    after_failure = (await client.get(f"/jobs/{job['id']}")).json()

    monkeypatch.setattr(publisher.activities, "break_down_description", real)
    rerun = await client.post(f"/jobs/{job['id']}/publish")
    after_rerun = (await client.get(f"/jobs/{job['id']}")).json()

    assert after_failure["status"] == "published"
    assert after_failure["publish_error"].startswith("Refreshing the analysis failed")
    assert rerun.status_code == 202
    assert after_rerun["status"] == "published"
    assert after_rerun["publish_error"] is None


async def test_a_refresh_that_cannot_start_is_recorded(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client)
    publisher.available = False

    edited = await client.patch(
        f"/jobs/{job['id']}", json={"description": "Rewritten while Temporal is down."}
    )
    after = (await client.get(f"/jobs/{job['id']}")).json()

    assert after["status"] == "published"
    assert "not refreshed" in after["publish_error"]
    # The edit's own response already says so — it does not show the state before.
    assert edited.json()["publish_error"] == after["publish_error"]


async def test_re_running_the_analysis_with_temporal_down_changes_nothing(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    """The 503 says nothing was changed, and that is kept true: an analysis that was
    current is not flagged as out of date just because a re-run could not start."""
    job = await make_job(client)
    publisher.available = False

    rerun = await client.post(f"/jobs/{job['id']}/publish")
    after = (await client.get(f"/jobs/{job['id']}")).json()

    assert rerun.status_code == 503
    assert after["status"] == "published"
    assert after["publish_error"] is None


async def test_only_a_live_job_is_started_as_a_refresh(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    job = await make_job(client)  # a first publish
    await client.patch(f"/jobs/{job['id']}", json={"description": "A second take on the text."})
    await client.post(f"/jobs/{job['id']}/publish")  # re-run the analysis

    assert publisher.refreshes == [False, True, True]


async def test_a_first_publish_is_never_marked_as_a_failed_refresh(
    client: AsyncClient, engine
) -> None:
    """A first publish whose last step committed but whose run then failed finds the
    job PUBLISHED at compensation. It must leave it alone: nothing was refreshed."""
    job = await make_job(client)  # published
    activities = PublishingActivities(async_sessionmaker(engine, expire_on_commit=False))

    first_publish = await activities.mark_job_publish_failed(
        MarkFailedInput(job_id=job["id"], reason="lost reply", refresh=False)
    )
    refresh = await activities.mark_job_publish_failed(
        MarkFailedInput(job_id=job["id"], reason="ValueError: bad", refresh=True)
    )

    assert first_publish is False
    assert refresh is True
    assert (
        (await client.get(f"/jobs/{job['id']}"))
        .json()["publish_error"]
        .startswith("Refreshing the analysis failed")
    )


def test_a_connection_failure_does_not_show_the_database_address() -> None:
    cause = ApplicationError(
        "[Errno 111] Connect call failed ('172.18.0.3', 5432)", type="ConnectionRefusedError"
    )

    reason = failure_reason(cause)

    assert "172.18" not in reason
    assert "could not be reached" in reason


async def test_a_slow_start_leaves_the_job_processing(
    client: AsyncClient, publisher: InlineJobPublisher
) -> None:
    """A deadline is not a "no": the run may be going, so the job is not put back."""
    job = await make_job(client, publish=False)

    async def slow(job_id: uuid.UUID, **_: object) -> None:
        raise WorkflowStartUnknownError()

    publisher.start = slow  # type: ignore[method-assign]
    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "workflow_start_unknown"
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "processing"


async def test_a_deadline_from_temporal_maps_to_start_unknown() -> None:
    class SlowClient:
        async def start_workflow(self, *args, **kwargs):
            raise RPCError("deadline", RPCStatusCode.DEADLINE_EXCEEDED, b"")

    with pytest.raises(WorkflowStartUnknownError):
        await TemporalJobPublisher(SlowClient()).start(uuid.uuid4())  # type: ignore[arg-type]


async def test_no_confirmation_after_a_withdrawal(
    client: AsyncClient, engine, processor: InlineApplicationProcessor, session: AsyncSession
) -> None:
    """A late run (the worker was down) must not tell a withdrawn candidate their
    application is in."""
    job = await make_job(client)
    candidate = await make_candidate(client)
    processor.available = False
    application = (await apply(client, job, candidate)).json()
    await client.delete(f"/applications/{application['id']}", headers=candidate["auth"])

    activities = ApplicationActivities(async_sessionmaker(engine, expire_on_commit=False))
    sent = await activities.send_application_received(application["id"])

    assert sent is False
    count = await session.scalar(select(func.count()).select_from(Notification))
    assert count == 0


async def test_the_database_refuses_a_score_out_of_range(
    session: AsyncSession, client: AsyncClient
) -> None:
    """The database refuses a score outside 0-100 from any writer."""
    job = await make_job(client)
    candidate = await make_candidate(client)
    application = (await apply(client, job, candidate)).json()

    with pytest.raises(Exception, match="ck_applications_match_score_range"):
        await session.execute(
            update(Application)
            .where(Application.id == uuid.UUID(application["id"]))
            .values(match_score=101)
        )
        await session.commit()
