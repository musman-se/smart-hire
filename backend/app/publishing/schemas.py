"""Publishing schemas — the structured content and the workflow's status."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.jobs.enums import JobStatus


class JobSectionsRead(BaseModel):
    summary: list[str]
    responsibilities: list[str]
    requirements: list[str]
    benefits: list[str]


class KeywordRead(BaseModel):
    keyword: str
    score: float = Field(description="Weight relative to the job's strongest term, 0..1")


class ExtractedSkillRead(BaseModel):
    name: str
    mentions: int


class JobContentRead(BaseModel):
    """What the publishing workflow extracted from the job's description."""

    job_id: uuid.UUID
    processed_at: datetime | None = Field(
        description="When the description was last analysed; null if it never has been"
    )
    sections: JobSectionsRead
    keywords: list[KeywordRead]
    extracted_skills: list[ExtractedSkillRead]


class WorkflowRunRead(BaseModel):
    workflow_id: str
    run_id: str
    status: str = Field(description="running, completed, failed, terminated, timed_out ...")
    current_step: str | None = Field(
        description="analysing, storing, marking_ready — live, while running"
    )
    started_at: datetime | None
    closed_at: datetime | None


class PublicationRead(BaseModel):
    """Where a job is in publishing — the job's state and the workflow's, side by side."""

    job_id: uuid.UUID
    job_status: JobStatus
    publish_error: str | None
    content_processed_at: datetime | None
    workflow: WorkflowRunRead | None = Field(
        description="The latest publishing run; null if the job was never published"
    )
