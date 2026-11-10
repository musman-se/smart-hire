"""Health endpoints.

Two endpoints, deliberately, because they answer different questions:

  /health        liveness  — is the process up? No dependencies checked.
  /health/ready  readiness — can it actually serve traffic? Checks Postgres, Temporal
                 and Redis.

Conflating them is a common mistake: a liveness probe that checks the database will
report the API as dead during a brief database blip, and an orchestrator will then
restart a perfectly healthy process.

The dependencies are not equal. Without Postgres the API can serve nothing, so
readiness fails (503). Without Temporal it still serves every read and every
application; only publishing waits. Without Redis, idempotency keys stop replaying, and
the database constraints still refuse duplicates. So either of those reports "degraded"
with a 200 — taking the whole API out of rotation for it would turn a partial outage
into a full one.
"""

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.db import SessionDep
from app.core.redis import redis_is_reachable
from app.core.temporal import temporal_is_reachable

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


# The database gets the same short leash as the other checks. Without it, a busy API
# whose pool is exhausted waited DB_POOL_TIMEOUT_SECONDS (30) here, and the probe timed
# out instead of answering.
DATABASE_CHECK_SECONDS = 2.0


@router.get("/health/ready", summary="Readiness probe")
async def readiness(session: SessionDep) -> JSONResponse:
    try:
        # Only the wait for a connection is timed out. Cancelling that is safe; cancelling
        # a query midway could leave its connection half-spoken and break the session's
        # teardown. SELECT 1 on a connection in hand answers at once.
        async with asyncio.timeout(DATABASE_CHECK_SECONDS):
            await session.connection()
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any failure to answer is "not ready"
        # Broad on purpose. A refused login, "the database system is starting up", a
        # timeout: each surfaces as a different exception class, and every one of them
        # must read as 503 to an orchestrator — never as a 500 from the probe itself.
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unreachable",
                "detail": type(exc).__name__,
            },
        )

    # Independent, so asked at the same time: the probe takes the slower of the two.
    temporal_ok, redis_ok = await asyncio.gather(temporal_is_reachable(), redis_is_reachable())
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok" if temporal_ok and redis_ok else "degraded",
            "database": "reachable",
            "temporal": "reachable" if temporal_ok else "unreachable",
            "redis": "reachable" if redis_ok else "unreachable",
        },
    )
