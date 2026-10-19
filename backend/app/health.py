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

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import SessionDep
from app.core.redis import redis_is_reachable
from app.core.temporal import temporal_is_reachable

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", summary="Readiness probe")
async def readiness(session: SessionDep) -> JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError) as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unreachable",
                "detail": type(exc).__name__,
            },
        )

    temporal_ok = await temporal_is_reachable()
    redis_ok = await redis_is_reachable()
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok" if temporal_ok and redis_ok else "degraded",
            "database": "reachable",
            "temporal": "reachable" if temporal_ok else "unreachable",
            "redis": "reachable" if redis_ok else "unreachable",
        },
    )
