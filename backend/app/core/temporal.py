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

from temporalio.client import Client
from temporalio.service import RPCError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None
_lock = asyncio.Lock()


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
