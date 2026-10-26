"""Regression tests for the defects found by reviewing Module 2 before merge.

Each test names the failure it prevents. Most of these returned a 500, lost data, or
left a job stranded — none of which the original suite exercised.
"""

import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from temporalio.exceptions import ApplicationError

from app.core.config import Settings
from app.core.db import get_session
from app.core.temporal import WorkflowUnavailableError
from app.jobs.models import Job
from app.main import app
from app.notifications.models import Notification
from app.publishing.content import KNOWN_SKILLS, extract_keywords, find_skills
from app.publishing.workflow import failure_reason
from tests.factories import apply, make_candidate, make_job
from tests.fakes import InlineJobPublisher

# --- publishing ----------------------------------------------------------------------


async def test_an_outage_revert_does_not_undo_a_concurrent_close(
    client: AsyncClient, engine, publisher: InlineJobPublisher
) -> None:
    """The revert after a failed start used to be an unconditional write: a recruiter
    who closed the job in that window had the close silently turned back into a draft."""
    job = await make_job(client, publish=False)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def close_then_fail(job_id: uuid.UUID) -> None:
        async with sessions() as other:  # a second recruiter, mid-flight
            row = await other.get(Job, job_id)
            row.status = "closed"
            await other.commit()
        raise WorkflowUnavailableError()

    publisher.start = close_then_fail  # type: ignore[method-assign]
    response = await client.post(f"/jobs/{job['id']}/publish")

    assert response.status_code == 503
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "closed"


async def test_an_outage_keeps_the_previous_failure_reason(
    client: AsyncClient, publisher: InlineJobPublisher, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The 503 says nothing was changed — so the reason for the earlier failure must
    still be there afterwards."""
    from app.core.config import settings

    job = await make_job(client, publish=False)
    monkeypatch.setattr(settings, "publishing_fault_rate", 1.0)
    await client.post(f"/jobs/{job['id']}/publish")
    reason = (await client.get(f"/jobs/{job['id']}")).json()["publish_error"]
    assert reason

    publisher.available = False
    retry = await client.post(f"/jobs/{job['id']}/publish")

    assert retry.status_code == 503
    after = (await client.get(f"/jobs/{job['id']}")).json()
    assert (after["status"], after["publish_error"]) == ("publish_failed", reason)


def test_a_database_failure_is_not_shown_to_recruiters_verbatim() -> None:
    raw = ApplicationError(
        'duplicate key value violates unique constraint "pk_job_keywords"',
        type="IntegrityError",
    )

    reason = failure_reason(raw)

    assert "pk_job_keywords" not in reason
    assert "database" in reason.lower()


def test_other_failures_keep_their_type_and_message() -> None:
    reason = failure_reason(ApplicationError("Injected fault", type="RuntimeError"))

    assert reason == "RuntimeError: Injected fault"
    assert len(failure_reason(ApplicationError("x" * 2000, type="RuntimeError"))) == 500


# --- content analysis ------------------------------------------------------------------


def test_long_terms_sharing_a_prefix_become_one_keyword() -> None:
    """Truncating after counting produced two identical 64-character keywords — a
    primary-key violation on every retry, so the job could never be published."""
    shared = "x" * 70
    keywords = extract_keywords("Role", f"{shared}aaa {shared}bbb")

    names = [k.keyword for k in keywords]
    assert len(names) == len(set(names))
    assert all(len(name) <= 64 for name in names)


def test_no_keyword_scores_zero() -> None:
    """A rare term next to a very common one rounded to 0.000, which the score > 0
    check refused — another permanent publish failure."""
    keywords = extract_keywords("Role", "dominant " * 5000 + "rare")

    assert all(k.score > 0 for k in keywords)


def test_skill_matching_scales_with_the_text_not_the_vocabulary() -> None:
    vocabulary = {f"skill{i}" for i in range(20_000)} | KNOWN_SKILLS
    text = ("We run kafka, docker and python services. " * 500)[:20_000]

    started = time.perf_counter()
    found = find_skills(text, vocabulary)
    elapsed = time.perf_counter() - started

    assert {"kafka", "docker", "python"} <= found.keys()
    assert elapsed < 1.0  # one regex scan per skill took tens of seconds here


# --- applications and notifications ----------------------------------------------------


async def test_a_200_character_title_still_gets_its_confirmation(
    client: AsyncClient, session: AsyncSession
) -> None:
    """The subject is a prefix plus the title; with a 200-character title it overflowed
    VARCHAR(200), so the insert failed on every retry and the email never went out."""
    job = await make_job(client, title="T" * 200, min_experience_years=0)
    candidate = await make_candidate(client)

    application = (await apply(client, job, candidate)).json()

    notification = await session.scalar(
        select(Notification).where(Notification.application_id == uuid.UUID(application["id"]))
    )
    assert notification is not None
    assert len(notification.subject) <= 200


async def test_application_read_has_no_phantom_note_field(client: AsyncClient) -> None:
    job = await make_job(client)
    candidate = await make_candidate(client)

    application = (await apply(client, job, candidate)).json()

    assert "note" not in application


# --- input validation: 422, never 500 ----------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Nul\x00 role", "description": "A description long enough."},
        {
            "title": "Big cap",
            "description": "A description long enough.",
            "max_applications": 10**12,
        },
        {"title": "Huge text", "description": "x" * 20_001},
    ],
    ids=["nul-character", "integer-overflow", "description-too-long"],
)
async def test_bad_input_is_a_validation_error_not_a_500(client: AsyncClient, body: dict) -> None:
    response = await client.post("/jobs", json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_a_row_stored_before_the_input_caps_still_reads_and_publishes(
    client: AsyncClient, session: AsyncSession
) -> None:
    """The caps once sat on the schema JobRead shares, so a row saved before they
    existed — a long description, a large cap — failed validation on every read: a 500
    on the job page and on the list that included it."""
    job = await make_job(client, publish=False)
    await session.execute(
        update(Job)
        .where(Job.id == uuid.UUID(job["id"]))
        .values(description="Build things with Python. " * 1_000, max_applications=10**9)
    )
    await session.commit()

    assert (await client.get(f"/jobs/{job['id']}")).status_code == 200
    assert (await client.get("/jobs")).status_code == 200
    assert (await client.post(f"/jobs/{job['id']}/publish")).status_code == 202
    assert (await client.get(f"/jobs/{job['id']}")).json()["status"] == "published"


async def test_an_absurd_offset_is_a_validation_error(client: AsyncClient) -> None:
    response = await client.get("/jobs", params={"offset": 2**63})

    assert response.status_code == 422


# --- platform ------------------------------------------------------------------------------


async def test_a_500_still_carries_its_request_id(engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """The middleware used to reset the id before Starlette built the 500 response, so
    the one error that most needs correlating carried request_id: null."""
    from app.jobs import service

    async def explode(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(service, "list_jobs", explode)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as raw:
        response = await raw.get("/jobs", headers={"X-Request-ID": "trace-123"})

    assert response.status_code == 500
    assert response.json()["error"]["request_id"] == "trace-123"


async def test_an_unsafe_incoming_request_id_is_replaced(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "x" * 500})

    assert response.headers["X-Request-ID"] != "x" * 500
    assert len(response.headers["X-Request-ID"]) == 32


async def test_a_405_says_which_methods_are_allowed(client: AsyncClient) -> None:
    response = await client.put("/health")

    assert response.status_code == 405
    assert "GET" in response.headers["allow"]


async def test_readiness_is_503_whatever_the_database_raises(engine) -> None:
    class Unreachable:
        async def execute(self, *args, **kwargs):
            raise ValueError("an exception class nobody listed")

    async def broken_session():
        yield Unreachable()

    app.dependency_overrides[get_session] = broken_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            response = await c.get("/health/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503


def test_inconsistent_page_sizes_fail_at_startup() -> None:
    with pytest.raises(ValidationError, match="DEFAULT_PAGE_SIZE"):
        Settings(_env_file=None, default_page_size=500, max_page_size=100)


def test_a_redis_url_without_a_scheme_fails_at_startup() -> None:
    with pytest.raises(ValidationError, match="REDIS_URL"):
        Settings(_env_file=None, redis_url="localhost:6379")


def test_production_refuses_injected_faults() -> None:
    with pytest.raises(ValidationError, match="PUBLISHING_FAULT_RATE"):
        Settings(
            _env_file=None,
            environment="production",
            postgres_password="a-real-secret",
            publishing_fault_rate=0.3,
        )


def test_a_missing_database_password_fails_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    # The password has no default in code; it must come from the environment or .env.
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError, match="POSTGRES_PASSWORD is not set"):
        Settings(_env_file=None)


def test_a_full_database_url_needs_no_separate_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    url = "postgresql+asyncpg://app:secret@db.internal:5432/smarthire"
    assert Settings(_env_file=None, DATABASE_URL=url).database_url == url
