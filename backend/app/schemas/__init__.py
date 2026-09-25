"""Pydantic schemas — the shapes that cross the API boundary.

Kept separate from app.models (SQLAlchemy, the shapes stored in tables) on purpose:
they describe different things and diverge as soon as a column must not reach a client.
"""

from app.schemas.application import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationStageUpdate,
)
from app.schemas.candidate import CandidateCreate, CandidateRead, CandidateUpdate
from app.schemas.common import ErrorBody, ErrorResponse, Page
from app.schemas.job import JobCreate, JobRead, JobUpdate

__all__ = [
    "ApplicationCreate",
    "ApplicationRead",
    "ApplicationStageUpdate",
    "CandidateCreate",
    "CandidateRead",
    "CandidateUpdate",
    "ErrorBody",
    "ErrorResponse",
    "JobCreate",
    "JobRead",
    "JobUpdate",
    "Page",
]
