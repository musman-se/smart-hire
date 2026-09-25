"""Application schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ApplicationStage


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


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    candidate_id: uuid.UUID
    stage: ApplicationStage
    cover_letter: str | None
    match_score: float | None = Field(
        default=None, description="Populated by the scoring worker in a later module"
    )
    created_at: datetime
    updated_at: datetime
