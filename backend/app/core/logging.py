"""Structured logging with a request id on every line.

The point is correlation. When a recruiter reports "applying failed at 3pm", you need
every log line for that one request — across routers, services and the database — not a
timestamp range. Each request gets an id, which is attached to every log record it
produces and returned in the X-Request-ID response header.

This is the seed of the observability work in a later module: swapping this contextvar
for an OpenTelemetry trace id changes this file and nothing else.
"""

import logging
import re
import sys
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"

# A ContextVar is the async equivalent of thread-local storage: each request's coroutine
# sees its own value, even though they interleave on one event loop.
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Injects request_id into every record so the formatter can print it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get() or "-"
        return True


# An incoming id is echoed into a response header and every log line, so only a safe,
# bounded shape is accepted; anything else gets a fresh id.
_VALID_INCOMING_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")


class RequestContextMiddleware:
    """Gives every request an id: on each log line it produces, in the X-Request-ID
    response header, and in every error body.

    A plain ASGI middleware, deliberately not Starlette's BaseHTTPMiddleware. The id has
    to stay set until the response is *sent*: uvicorn writes its access-log line then,
    and an unhandled exception becomes its 500 response in Starlette's outermost
    ServerErrorMiddleware — after this middleware has returned. The first version reset
    the id the moment the handler returned, so access logs and every 500 lost it.

    Nothing is reset afterwards, and nothing needs to be: the server runs each request
    in its own task, with its own copy of the context, so one request's id cannot leak
    into another's.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Honour an incoming id, so one id can follow a request across services.
        incoming = dict(scope.get("headers") or []).get(REQUEST_ID_HEADER.lower().encode())
        decoded = incoming.decode("latin-1") if incoming else ""
        request_id = decoded if _VALID_INCOMING_ID.fullmatch(decoded) else uuid.uuid4().hex
        _request_id.set(request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                headers.append((REQUEST_ID_HEADER.encode(), request_id.encode()))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_id)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Uvicorn installs its own handlers; let them fall through to ours instead.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
