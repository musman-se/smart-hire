"""Health endpoints.

Two endpoints, deliberately, because they answer different questions:

  /health        liveness  — is the process up? No dependencies checked.
  /health/ready  readiness — can it actually serve traffic? Checks Postgres.

Conflating them is a common mistake: a liveness probe that checks the database will
report the API as dead during a brief database blip, and an orchestrator will then
restart a perfectly healthy process.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import SessionDep

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

    return JSONResponse(
        status_code=200,
        content={"status": "ok", "database": "reachable"},
    )
