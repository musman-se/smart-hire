"""Errors raised by the jobs domain."""

from app.core.errors import ConflictError, NotFoundError


class JobNotFoundError(NotFoundError):
    def __init__(self, job_id: object) -> None:
        super().__init__(f"Job {job_id} does not exist.")


class JobNotOpenError(ConflictError):
    """The job's lifecycle state refuses the operation — editing a closed job, applying
    to a draft."""

    code = "job_not_open"
