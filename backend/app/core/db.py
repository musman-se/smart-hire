"""Database engine and session wiring.

Phase 0 only uses this to prove the API can reach Postgres. Phase 2 builds the real
models and migrations on top of it — the engine and session factory do not change.
"""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# One engine per process. It holds the connection pool, so creating it per request
# would defeat pooling entirely.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,  # check a pooled connection is alive before handing it out
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency yielding a session, closed automatically after the request."""
    async with SessionLocal() as session:
        yield session


# Annotated alias so routes read `session: SessionDep` instead of repeating
# `Depends(get_session)` in every signature. This is the pattern FastAPI recommends,
# and it keeps the dependency out of a mutable default argument.
SessionDep = Annotated[AsyncSession, Depends(get_session)]
