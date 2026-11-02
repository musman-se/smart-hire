"""Test fixtures.

These tests run against a real PostgreSQL instance, in a separate `smarthire_test`
database that is created on demand; its tables are dropped at the end.

Using the real database rather than SQLite is deliberate. The rules this suite exists to
prove — the unique constraint on (job_id, candidate_id), array containment, native enum
types — either behave differently on SQLite or do not exist there. A test suite that
passes on a database you do not deploy proves very little.

If Postgres is not reachable, every database test skips with a clear message rather than
failing noisily.
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator, Iterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from temporalio.client import Client

from app.applications.processor import get_application_processor
from app.auth import security
from app.auth import service as auth_service
from app.auth.models import User
from app.auth.security import create_access_token
from app.core.config import settings
from app.core.db import get_session
from app.core.idempotency import IdempotencyStore, get_idempotency_store
from app.main import app
from app.models import Base
from app.publishing.publisher import get_job_publisher
from tests.factories import TEST_PASSWORD
from tests.fakes import InlineApplicationProcessor, InlineJobPublisher

TEST_DB_NAME = settings.test_database_name


def _swap_database(url: str, name: str) -> str:
    """Replace the database name in a SQLAlchemy URL, keeping credentials and host."""
    base, _, _ = url.rpartition("/")
    return f"{base}/{name}"


TEST_DATABASE_URL = _swap_database(settings.database_url, TEST_DB_NAME)
ADMIN_DATABASE_URL = _swap_database(settings.database_url, "postgres")


@pytest.fixture(scope="session", autouse=True)
def fast_password_hashing() -> Iterator[None]:
    """Argon2id with its real parameters costs about 0.1 s and 64 MiB per hash — by
    design — and the suite registers and signs in hundreds of accounts. The same
    algorithm with minimal cost keeps that to milliseconds. It changes the work factor
    only: hashing and verifying run through exactly the same code."""
    production = security.password_hasher
    security.password_hasher = PasswordHash(
        (Argon2Hasher(time_cost=1, memory_cost=1024, parallelism=1),)
    )
    yield
    security.password_hasher = production


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncGenerator:
    # CREATE DATABASE cannot run inside a transaction, hence AUTOCOMMIT.
    admin = create_async_engine(ADMIN_DATABASE_URL, isolation_level="AUTOCOMMIT")

    try:
        async with admin.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": TEST_DB_NAME},
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    except Exception as exc:  # noqa: BLE001 - any connection failure means "no database"
        await admin.dispose()
        pytest.skip(f"PostgreSQL unreachable ({type(exc).__name__}). Run: docker compose up -d db")
    finally:
        await admin.dispose()

    test_engine = create_async_engine(TEST_DATABASE_URL)

    # create_all rather than running migrations: this suite tests application behaviour,
    # and the migration is verified separately by `alembic upgrade head` against the dev
    # database. Keeping them apart means a broken migration cannot mask a broken rule.
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables(engine) -> AsyncGenerator[None]:
    """Empty every table before each test so ordering cannot matter.

    TRUNCATE ... CASCADE is far faster than deleting rows, and resets the tables in one
    statement regardless of foreign keys.
    """
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE applications, job_skills, candidate_skills, skills, "
                "candidates, jobs, refresh_tokens, users CASCADE"
            )
        )
    yield


@pytest_asyncio.fixture
async def session(engine) -> AsyncGenerator[AsyncSession]:
    """A session for tests that exercise the database directly, bypassing HTTP."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db_session:
        yield db_session


@pytest_asyncio.fixture
async def publisher(engine) -> InlineJobPublisher:
    """The publishing workflow, run inline. Tests may flip `publisher.available`."""
    return InlineJobPublisher(async_sessionmaker(engine, expire_on_commit=False))


@pytest_asyncio.fixture
async def processor(engine) -> InlineApplicationProcessor:
    """Application processing (scoring, confirmation), run inline."""
    return InlineApplicationProcessor(async_sessionmaker(engine, expire_on_commit=False))


@pytest_asyncio.fixture
async def temporal() -> Client:
    """A client for the Compose Temporal server; the test skips if it is unreachable."""
    try:
        client = await asyncio.wait_for(
            Client.connect(settings.temporal_address, namespace=settings.temporal_namespace),
            timeout=5,
        )
        await asyncio.wait_for(client.service_client.check_health(), timeout=5)
    except Exception as exc:  # noqa: BLE001 - any failure means "no server to test against"
        pytest.skip(
            f"Temporal unreachable ({type(exc).__name__}). Run: docker compose up -d temporal"
        )
    return client


@pytest_asyncio.fixture
async def test_redis() -> AsyncGenerator[Redis]:
    """Redis logical database 15 — never the app's — emptied before each test.

    Not skipped when Redis is down: the idempotency store fails open, so most tests run
    regardless. Tests that need Redis ask for `redis_available` too.
    """
    redis = Redis.from_url(settings.test_redis_url, decode_responses=True, socket_timeout=1)
    try:
        await redis.flushdb()
    except (RedisError, OSError):
        pass
    yield redis
    await redis.aclose()


@pytest_asyncio.fixture
async def redis_available(test_redis: Redis) -> None:
    try:
        await test_redis.ping()
    except (RedisError, OSError) as exc:
        pytest.skip(f"Redis unreachable ({type(exc).__name__}). Run: docker compose up -d redis")


@pytest_asyncio.fixture
async def recruiter(engine) -> User:
    """A recruiter account, created the way the CLI creates one."""
    async with async_sessionmaker(engine, expire_on_commit=False)() as db_session:
        return await auth_service.create_recruiter(
            db_session, "recruiter@example.com", TEST_PASSWORD
        )


def bearer(user_id: uuid.UUID) -> dict[str, str]:
    """Authorization headers for a user, minted directly rather than by signing in."""
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


@pytest_asyncio.fixture
async def client(
    engine,
    recruiter: User,
    publisher: InlineJobPublisher,
    processor: InlineApplicationProcessor,
    test_redis: Redis,
) -> AsyncGenerator[AsyncClient]:
    """An HTTP client bound to the app, with its dependencies redirected, signed in as
    a recruiter. A request that should run as a candidate passes that candidate's
    headers (tests.factories.make_candidate returns them); `anonymous` sends none.

    dependency_overrides is FastAPI's seam for exactly this: the app is untouched, but
    every route that asks for a session gets one pointed at the test database, and every
    route that starts a workflow gets the inline publisher.
    """
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        async with factory() as db_session:
            yield db_session

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_job_publisher] = lambda: publisher
    app.dependency_overrides[get_application_processor] = lambda: processor
    app.dependency_overrides[get_idempotency_store] = lambda: IdempotencyStore(
        test_redis, ttl_seconds=3600, lock_seconds=60
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=bearer(recruiter.id)
    ) as async_client:
        yield async_client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def anonymous(client: AsyncClient) -> AsyncGenerator[AsyncClient]:
    """The same app and overrides as `client` — they live on the app — with no
    credentials."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as raw:
        yield raw
