"""Errors raised by the publishing domain."""

from fastapi import status

from app.core.errors import DomainError


class WorkflowUnavailableError(DomainError):
    """The workflow engine could not be reached, so nothing was started.

    503, not 500: the request was fine and the server is fine; a dependency is down,
    and the same request will work once it is back.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "workflow_unavailable"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message
            or "The publishing engine is unavailable right now. Nothing was changed; "
            "try again shortly."
        )
