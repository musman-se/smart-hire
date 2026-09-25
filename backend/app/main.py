"""Application entry point.

Uvicorn is pointed at the `app` object below: `uvicorn app.main:app`.
FastAPI builds the ASGI application; Uvicorn is the ASGI server that runs it.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routers import applications, candidates, health, jobs
from app.core.config import settings
from app.core.db import engine
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.schemas.common import ErrorResponse

configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup happens before yield, shutdown after. Disposing the engine closes every
    # pooled connection — without it, reloads leak Postgres connections until it refuses
    # new ones.
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    summary="Core recruitment platform — Module 1: Foundation + Core Services",
    lifespan=lifespan,
    # Documents the single error shape used by every failure response.
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)

app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)

# Routers are mounted here so main.py stays a table of contents for the API.
app.include_router(health.router)
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(applications.job_applications_router, prefix="/jobs", tags=["applications"])
app.include_router(candidates.router, prefix="/candidates", tags=["candidates"])
app.include_router(applications.router, prefix="/applications", tags=["applications"])
