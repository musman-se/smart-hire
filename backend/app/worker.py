"""The Temporal worker — the process that runs workflow and activity code.

    python -m app.worker

The API never executes a workflow. It asks the Temporal server to start one, and the
server puts tasks on a named task queue. This process long-polls that queue, runs what
it receives — workflow code to decide the next step, activity code to do it — and
reports each result back to the server, which records it in the workflow's history.

Because the server holds that history, a worker holds nothing that matters: kill it
mid-workflow and another (or the same one, restarted) carries on from the last recorded
step. Run several and Temporal spreads the tasks across them.
"""

import asyncio
import contextlib
import logging
import signal
from datetime import timedelta

from temporalio.client import Client
from temporalio.worker import Worker

import app.models  # noqa: F401 — registers every model, so relationships resolve
from app.applications.activities import ApplicationActivities
from app.applications.workflow import ProcessApplicationWorkflow
from app.core.config import settings
from app.core.db import SessionLocal, engine
from app.core.logging import configure_logging
from app.publishing.activities import PublishingActivities
from app.publishing.workflow import PublishJobWorkflow

logger = logging.getLogger("app.worker")


def build_worker(client: Client, task_queue: str, session_factory=SessionLocal) -> Worker:
    """Every workflow and activity this service runs, on one task queue.

    Separate from main() so the integration tests build the identical worker against
    the test database and a private task queue.
    """
    publishing = PublishingActivities(session_factory)
    applications = ApplicationActivities(session_factory)
    return Worker(
        client,
        task_queue=task_queue,
        workflows=[PublishJobWorkflow, ProcessApplicationWorkflow],
        activities=publishing.all() + applications.all(),
        # The SDK's default is zero: on shutdown, running activities are cancelled at
        # once. A grace period lets a half-done store_job_content commit instead of
        # being cancelled and waiting out its start-to-close timeout before a retry.
        graceful_shutdown_timeout=timedelta(seconds=settings.worker_shutdown_grace_seconds),
    )


async def connect(attempts: int = 10) -> Client:
    """Connect, retrying while the Temporal server finishes starting."""
    for attempt in range(1, attempts + 1):
        try:
            return await Client.connect(
                settings.temporal_address, namespace=settings.temporal_namespace
            )
        except RuntimeError as exc:
            if attempt == attempts:
                raise
            logger.warning("temporal_connect_retry attempt=%d error=%s", attempt, exc)
            await asyncio.sleep(min(2 * attempt, 10))
    raise AssertionError("unreachable")


async def main() -> None:
    configure_logging(settings.log_level)
    client = await connect()
    worker = build_worker(client, settings.temporal_task_queue)

    # docker stop sends SIGTERM. Leaving `async with worker` stops polling for new tasks
    # and gives running activities WORKER_SHUTDOWN_GRACE_SECONDS to finish; anything
    # still running then is cancelled and retried by Temporal. Dying mid-activity would
    # also be safe — activities are idempotent — only slower to recover.
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError):  # Windows has no signal handlers
            loop.add_signal_handler(sig, stop.set)

    logger.info(
        "worker_started environment=%s task_queue=%s temporal=%s",
        settings.environment,
        settings.temporal_task_queue,
        settings.temporal_address,
    )
    async with worker:
        await stop.wait()
    logger.info("worker_stopped")
    await engine.dispose()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
