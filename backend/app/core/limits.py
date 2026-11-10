"""A ceiling on request bodies.

Nothing else bounds them: uvicorn reads whatever it is sent, and FastAPI parses and
validates the whole body before any route runs. A multi-hundred-megabyte JSON body to a
public endpoint such as /auth/register would sit in memory and then be parsed on the
event loop, stalling every other request. No body this API accepts comes near the limit
— the largest field is a 20,000-character job description.
"""

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import payload_too_large_response


class BodySizeLimitMiddleware:
    """Refuses a body larger than `max_bytes` with 413, in the API's error envelope.

    A declared Content-Length over the limit is refused before anything is read. A body
    that arrives without one (chunked) is counted as it streams, and reading stops at the
    limit: the route's body read raises a 413 HTTPException — the one exception type
    FastAPI's body parsing lets through rather than turning into a 400 — which the
    exception handlers answer in the same envelope.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            response = payload_too_large_response(self._message())
            await response(scope, receive, send)
            return

        received = 0

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(413, self._message())
            return message

        await self.app(scope, counting_receive, send)

    def _message(self) -> str:
        return f"The request body is larger than {self.max_bytes:,} bytes."
