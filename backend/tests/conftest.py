"""Test fixtures.

These tests run against a real PostgreSQL instance, in a separate `smarthire_test`
database that is created on demand and dropped at the end.

Using the real database rather than SQLite is deliberate. The rules this suite exists to
prove — the unique constraint on (job_id, candidate_id), array containment, native enum
types — either behave differently on SQLite or do not exist there. A test suite that
passes on a database you do not deploy proves very little.

If Postgres is not reachable, every database test skips with a clear message rather than
failing noisily.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.db import get_session
from app.main import app
from app.models import Base

TEST_DB_NAME = "smarthire_test"


def _swap_database(url: str, name: str) -> str:
    """Replace the database name in a SQLAlchemy URL, keeping credentials and host."""
    base, _, _ = url.rpartition("/")
    return f"{base}/{name}"


TEST_DATABASE_URL = _swap_database(settings.database_url, TEST_DB_NAME)
ADMIN_DATABASE_URL = _swap_database(settings.database_url, "postgres")


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
        await conn.execute(text("TRUNCATE applications, candidates, jobs CASCADE"))
    yield


@pytest_asyncio.fixture
async def session(engine) -> AsyncGenerator[AsyncSession]:
    """A session for tests that exercise the database directly, bypassing HTTP."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db_session:
        yield db_session


@pytest_asyncio.fixture
async def client(engine) -> AsyncGenerator[AsyncClient]:
    """An HTTP client bound to the app, with the database dependency redirected.

    dependency_overrides is FastAPI's seam for exactly this: the app is untouched, but
    every route that asks for a session gets one pointed at the test database.
    """
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        async with factory() as db_session:
            yield db_session

    app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()
