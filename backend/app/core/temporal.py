"""The Temporal client — how the API talks to the workflow engine.

The API never runs workflow code. It asks the Temporal server to *start* a workflow,
and a separate worker process (app/worker.py) picks the work up and runs it. The client
here is that line to the server: one per process, shared, like the database engine.

It connects lazily — `lazy=True` returns at once and opens the connection on first use —
so the API starts, and serves everything that does not need Temporal, even while the
Temporal server is still booting or briefly down.
"""

import asyncio
import logging

from fastapi import status
from temporalio.client import Client
from temporalio.service import RPCError

from app.core.config import settings
from app.core.errors import DomainError

logger = logging.getLogger(__name__)

_client: Client | None = None
_lock = asyncio.Lock()


# Database errors a retry cannot fix: the same statement fails the same way every time.
# Both workflows fail fast on them — to compensation in seconds, or to a Failed run a
# recruiter can re-process — instead of retrying for ever. OperationalError and
# InterfaceError stay retryable: a restart or a dropped connection is exactly what a
# retry is for.
#
# IntegrityError is not on this list. Publishing can meet one as a passing race — a
# replaced run's last write landing beside the new run's — which the next attempt
# resolves, and its attempts are bounded anyway. Processing, whose attempts are not,
# adds it (app.applications.workflow).
NON_RETRYABLE_DATABASE_ERRORS = ["DataError", "ProgrammingError"]

# Errors that mean a bug in our own code: the same input fails the same way on every
# attempt. A workflow that retries without limit must stop on them, or a bug would
# keep one run spinning for ever — and the console's re-process would only attach to it.
PROGRAMMING_ERRORS = [
    "TypeError",
    "AttributeError",
    "KeyError",
    "IndexError",
    "ValueError",
    "NameError",
]


class WorkflowStartUnknownError(DomainError):
    """Temporal did not answer in time, so the run may or may not have started.

    Not WorkflowUnavailableError: that one promises nothing was changed, and a caller
    acting on it (putting a job back to DRAFT) could undo a run that is in fact going.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "workflow_start_unknown"

    def __init__(self) -> None:
        super().__init__(
            "The workflow engine was slow to answer, so publishing may have started. "
            "Check the job again in a moment; if it is stuck, restart publishing."
        )


class WorkflowUnavailableError(DomainError):
    """Temporal could not be reached, so no workflow was started.

    503, not 500: the request was fine and the API is fine; a dependency is down, and
    the same request will work once it is back.
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "workflow_unavailable"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message
            or "The workflow engine is unavailable right now. Nothing was changed; "
            "try again shortly."
        )


async def get_temporal_client() -> Client:
    """The process-wide client, created on first call."""
    global _client
    if _client is None:
        async with _lock:
            if _client is None:
                _client = await Client.connect(
                    settings.temporal_address,
                    namespace=settings.temporal_namespace,
                    lazy=True,
                )
    return _client


async def temporal_is_reachable(timeout_seconds: float = 2.0) -> bool:
    """A cheap round trip to the server, for the readiness probe."""
    try:
        client = await get_temporal_client()
        return await asyncio.wait_for(client.service_client.check_health(), timeout_seconds)
    except (RPCError, TimeoutError, OSError, RuntimeError) as exc:
        logger.warning("temporal_unreachable error=%s", type(exc).__name__)
        return False


async def close_temporal_client() -> None:
    """Forget the client on shutdown. The SDK closes its connection when the client is
    garbage-collected; dropping the reference lets that happen before the loop closes."""
    global _client
    _client = None
