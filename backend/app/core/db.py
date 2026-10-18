"""Database engine and session wiring.

Every engine setting comes from app.core.config, so pool size or SQL echo can be tuned
per environment without a code change.
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
    echo=settings.db_echo,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_recycle=settings.db_pool_recycle_seconds,
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
