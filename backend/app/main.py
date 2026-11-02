"""Application entry point.

Uvicorn is pointed at the `app` object below: `uvicorn app.main:app`.
FastAPI builds the ASGI application; Uvicorn is the ASGI server that runs it.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app import health
from app.applications import router as applications
from app.auth import router as auth
from app.auth.dependencies import get_current_user
from app.candidates import router as candidates
from app.core.config import settings
from app.core.db import engine
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.redis import close_redis
from app.core.schemas import ErrorResponse
from app.core.temporal import close_temporal_client
from app.jobs import router as jobs
from app.publishing import router as publishing
from app.skills import router as skills

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup happens before yield, shutdown after. Disposing the engine closes every
    # pooled connection — without it, reloads leak Postgres connections until it refuses
    # new ones.
    logger.info("api_started environment=%s log_level=%s", settings.environment, settings.log_level)
    yield
    await engine.dispose()
    await close_temporal_client()
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    summary="Core recruitment platform — Module 2: application workflow + publishing pipeline",
    description=(
        "Sign in with POST /auth/login, then send the access token as "
        "`Authorization: Bearer <token>` — the Authorize button below does that here."
    ),
    lifespan=lifespan,
    # Documents the single error shape used by every failure response.
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)

app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)

# Routers are mounted here so main.py stays a table of contents for the API.
#
# Public: the health probes, and the auth endpoints that hand out tokens.
app.include_router(health.router)
app.include_router(auth.router, prefix="/auth", tags=["auth"])

# Everything else requires a signed-in user, declared once, here, rather than route by
# route — an endpoint added later is protected without anyone remembering to protect it.
# Routes then narrow it by role (RecruiterDep, CandidateDep).
signed_in = [Depends(get_current_user)]
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"], dependencies=signed_in)
app.include_router(publishing.router, prefix="/jobs", tags=["publishing"], dependencies=signed_in)
app.include_router(
    applications.job_applications_router,
    prefix="/jobs",
    tags=["applications"],
    dependencies=signed_in,
)
app.include_router(
    candidates.router, prefix="/candidates", tags=["candidates"], dependencies=signed_in
)
app.include_router(
    applications.router, prefix="/applications", tags=["applications"], dependencies=signed_in
)
app.include_router(skills.router, prefix="/skills", tags=["skills"], dependencies=signed_in)
