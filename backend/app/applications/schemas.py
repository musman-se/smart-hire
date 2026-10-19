"""Application schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.applications.enums import ApplicationStage
from app.core.schemas import ReadModel


class ApplicationCreate(BaseModel):
    """The job is taken from the URL (POST /jobs/{job_id}/applications), so it is not
    repeated in the body — two sources for one value invites them to disagree."""

    candidate_id: uuid.UUID
    cover_letter: str | None = Field(default=None, max_length=5000)


class ApplicationStageUpdate(BaseModel):
    """Stage transitions get their own endpoint and their own schema.

    Advancing a candidate is a distinct operation with its own rules, not a field edit
    — modelling it as a PATCH on `stage` would make "apply" and "reject" the same action.
    """

    stage: ApplicationStage
    note: str | None = Field(
        default=None, max_length=1000, description="Why — kept in the application's history"
    )


class StageChangeRead(ReadModel):
    from_stage: ApplicationStage | None
    to_stage: ApplicationStage
    note: str | None
    changed_at: datetime


class ApplicationRead(ReadModel):
    id: uuid.UUID
    job_id: uuid.UUID
    candidate_id: uuid.UUID
    stage: ApplicationStage
    note: str | None = Field(
        default=None, max_length=1000, description="Why — kept in the application's history"
    )
    cover_letter: str | None
    match_score: float | None = Field(
        default=None, description="Populated by the scoring worker in a later module"
    )
    created_at: datetime
    updated_at: datetime
