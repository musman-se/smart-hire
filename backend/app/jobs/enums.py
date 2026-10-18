"""Job enumerations.

StrEnum means each member is a real `str`, so it serialises to JSON as its value with
no conversion step. These are stored as native PostgreSQL enum types — the database
rejects an invalid value rather than trusting the application to have checked.
"""

from enum import StrEnum


class JobStatus(StrEnum):
    """Lifecycle of a job posting.

        draft           --publish-->            processing
        publish_failed  --publish (retry)-->    processing
        processing      --workflow succeeds-->  published
        processing      --workflow fails-->     publish_failed
        any but closed  --close-->              closed
        closed          --reopen-->             draft

    PROCESSING is the Module 2 addition: publishing is no longer a field flip but a
    Temporal workflow (app/publishing/workflow.py) that extracts skills and breaks the
    description down, and only then marks the job PUBLISHED — the brief's "ready".
    Candidates can apply only to a PUBLISHED job.
    """

    DRAFT = "draft"
    PROCESSING = "processing"
    PUBLISHED = "published"
    PUBLISH_FAILED = "publish_failed"
    CLOSED = "closed"


class EmploymentType(StrEnum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"
