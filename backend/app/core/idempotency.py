"""Idempotency keys — a retried request gets the original answer, not a second action.

A client that sends POST /jobs and hears nothing back (a timeout, a dropped connection)
cannot tell whether the job was created. Retrying is the only sensible move — and
without protection it creates a second job. Duplicate prevention does not solve this:
for an application, the unique constraint turns the retry into "409 already applied",
which tells a client whose first request succeeded that it failed.

The fix is the one payment APIs use. The client generates a key per *intended action*
and sends it as an `Idempotency-Key` header; retries of that action resend the same key.

    first request    claim the key, run the action, store the response under the key
    retry            same key, same body  -> replay the stored response, run nothing
    concurrent retry same key, still running -> 409 idempotency_in_progress
    misuse           same key, different body -> 422 idempotency_key_reused

Records live in Redis with an expiry (IDEMPOTENCY_TTL_SECONDS, a day by default): long
enough to cover any realistic retry, short enough that the store never grows without
bound. Redis because this is exactly what it is for — small, short-lived records with a
built-in expiry — and because `SET ... NX` claims a key atomically.

**Layered, not single, defence.** Without the header, or with Redis down, requests run
normally: the database constraints still refuse a duplicate application. The key
upgrades "refused" to "the original answer"; it is never the only guard. That is why a
Redis outage fails *open* — logs a warning and carries on — rather than refusing work.

Only 2xx and 4xx responses are stored. A 4xx is a real answer and a retry would get
the same one; a 5xx — including a DomainError that carries one, such as
workflow_unavailable — or a crash releases the key, so the client may try again.

**The remaining gap.** The response is stored *after* the transaction commits. If the
process dies between the two, the claim stays "in progress" until it expires
(IDEMPOTENCY_LOCK_SECONDS); a retry before then gets 409 idempotency_in_progress, and a
retry after it runs the action again. For an application or a candidate the database
then refuses the duplicate (409). For a job, which has no natural unique key, the retry
creates a second job. Closing that window means storing the key in Postgres, in the
same transaction as the row it protects — the upgrade path if it ever matters.
"""

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.errors import ConflictError, DomainError, UnprocessableError
from app.core.logging import get_request_id
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

REPLAYED_HEADER = "Idempotent-Replayed"


class IdempotencyInProgressError(ConflictError):
    code = "idempotency_in_progress"

    def __init__(self) -> None:
        super().__init__(
            "A request with this Idempotency-Key is still being processed. Retry shortly."
        )


class IdempotencyKeyReusedError(UnprocessableError):
    code = "idempotency_key_reused"

    def __init__(self) -> None:
        super().__init__(
            "This Idempotency-Key was already used for a different request. "
            "Use a new key for a new action."
        )


IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=255,
        description="Any unique string per intended action, e.g. a UUID. Resend it on retry.",
    ),
]


class IdempotencyStore:
    def __init__(self, redis: Redis, *, ttl_seconds: int, lock_seconds: int) -> None:
        self._redis = redis
        self._ttl = ttl_seconds
        # How long an in-progress claim survives if the process dies mid-request.
        self._lock = lock_seconds

    async def run(
        self,
        *,
        key: str | None,
        request: Request,
        body: BaseModel | None,
        status_code: int,
        operation: Callable[[], Awaitable[Any]],
    ) -> JSONResponse:
        """Run `operation` at most once per key, and answer every retry the same way."""
        if key is None:
            return self._respond(status_code, await operation())

        redis_key = f"idempotency:{request.method}:{request.url.path}:{key}"
        fingerprint = _fingerprint(body)

        try:
            stored = await self._claim(redis_key, fingerprint)
        except RedisError as exc:
            logger.warning("idempotency_unavailable error=%s — running unprotected", exc)
            return self._respond(status_code, await operation())

        if stored is not None:
            logger.info("idempotency_replay key=%s status=%s", key, stored["status"])
            response = JSONResponse(status_code=stored["status"], content=stored["body"])
            response.headers[REPLAYED_HEADER] = "true"
            return response

        try:
            result = await operation()
        except DomainError as exc:
            if exc.status_code >= 500:
                # A dependency was down — not an answer about this request. Replaying it
                # for a day would turn a blip into an outage for this client.
                await self._release(redis_key)
                raise
            # A business refusal is a real answer: store it, so a retry hears it again.
            envelope = {
                "error": {"code": exc.code, "message": exc.message, "request_id": get_request_id()}
            }
            await self._store(redis_key, fingerprint, exc.status_code, envelope)
            raise
        except BaseException:
            await self._release(redis_key)
            raise

        content = jsonable_encoder(result)
        await self._store(redis_key, fingerprint, status_code, content)
        return JSONResponse(status_code=status_code, content=content)

    async def _claim(self, redis_key: str, fingerprint: str) -> dict | None:
        """Atomically claim the key, or return the stored response for it."""
        marker = json.dumps({"state": "in_progress", "fingerprint": fingerprint})
        # SET NX: set only if absent, in one step. Two concurrent requests with one key
        # cannot both succeed here — exactly one claims it.
        if await self._redis.set(redis_key, marker, nx=True, ex=self._lock):
            return None

        raw = await self._redis.get(redis_key)
        if raw is None:  # expired between the two calls; claim it now
            return await self._claim(redis_key, fingerprint)
        record = json.loads(raw)
        if record["fingerprint"] != fingerprint:
            raise IdempotencyKeyReusedError()
        if record["state"] == "in_progress":
            raise IdempotencyInProgressError()
        return record

    async def _store(self, redis_key: str, fingerprint: str, status: int, body: Any) -> None:
        record = {"state": "done", "fingerprint": fingerprint, "status": status, "body": body}
        try:
            await self._redis.set(redis_key, json.dumps(record), ex=self._ttl)
        except RedisError as exc:
            # The action happened; only the replay is lost. A retry will hit the
            # database's own duplicate rules instead.
            logger.warning("idempotency_store_failed error=%s", exc)

    async def _release(self, redis_key: str) -> None:
        try:
            await self._redis.delete(redis_key)
        except RedisError as exc:
            logger.warning("idempotency_release_failed error=%s", exc)

    @staticmethod
    def _respond(status_code: int, result: Any) -> JSONResponse:
        return JSONResponse(status_code=status_code, content=jsonable_encoder(result))


def _fingerprint(body: BaseModel | None) -> str:
    """A hash of the request body, so one key cannot be reused for a different action."""
    canonical = body.model_dump_json() if body is not None else ""
    return hashlib.sha256(canonical.encode()).hexdigest()


def get_idempotency_store() -> IdempotencyStore:
    return IdempotencyStore(
        get_redis(),
        ttl_seconds=settings.idempotency_ttl_seconds,
        lock_seconds=settings.idempotency_lock_seconds,
    )


IdempotencyDep = Annotated[IdempotencyStore, Depends(get_idempotency_store)]
