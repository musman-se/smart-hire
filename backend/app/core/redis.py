"""The Redis client — one per process, created on first use.

Redis is an in-memory key-value store: reads and writes take well under a millisecond,
and every key can carry an expiry after which Redis deletes it by itself. SmartHire uses
it for short-lived state that does not belong in Postgres — today, idempotency records
(app/core/idempotency.py).

Nothing here is a source of truth. If Redis is lost, the cost is a weaker guarantee for
a while, never lost data — Postgres constraints still hold every business rule.
"""

import asyncio
import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Redis | None = None


def get_redis() -> Redis:
    """The process-wide client. Creating it opens no connection; the first command does."""
    global _client
    if _client is None:
        _client = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            # Fail fast: a request must not hang because a cache is slow.
            socket_timeout=settings.redis_timeout_seconds,
            socket_connect_timeout=settings.redis_timeout_seconds,
        )
    return _client


async def redis_is_reachable() -> bool:
    try:
        return bool(await asyncio.wait_for(get_redis().ping(), settings.redis_timeout_seconds))
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("redis_unreachable error=%s", type(exc).__name__)
        return False


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
