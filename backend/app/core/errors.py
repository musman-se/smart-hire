"""The error base classes, and the handlers that turn them into HTTP responses.

Each domain package declares its own errors in its own `errors.py` — `JobNotOpenError`
lives with jobs, `DuplicateApplicationError` with applications. This module holds only
what they have in common: the base classes, and the single place where any of them
becomes an HTTP response.

Domain errors know nothing about HTTP beyond carrying a status code, so the same service
is callable from a Temporal activity or a Celery worker without dragging FastAPI along.

Every error leaves this API in one shape:

    {"error": {"code": "...", "message": "...", "request_id": "..."}}

including FastAPI's own validation failures, which are reshaped below. A client can then
branch on one stable `code` instead of pattern-matching prose.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import REQUEST_ID_HEADER, get_request_id

logger = logging.getLogger(__name__)


class DomainError(Exception):
    """Base class for expected, business-meaningful failures."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "domain_error"
    # Response headers the status code requires — WWW-Authenticate on a 401.
    headers: dict[str, str] | None = None

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UnauthorizedError(DomainError):
    """The caller has not proved who they are: no token, or one that does not verify.

    401 must carry WWW-Authenticate (RFC 9110), naming the scheme the client should use.
    """

    status_code = status.HTTP_401_UNAUTHORIZED
    code = "not_authenticated"
    headers = {"WWW-Authenticate": "Bearer"}


class ForbiddenError(DomainError):
    """The caller is known, but their role does not allow this."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class NotFoundError(DomainError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(DomainError):
    """The request is valid, but the current state of the system refuses it."""

    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class UnprocessableError(DomainError):
    """The request is well-formed, but its content fails a business rule."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "unprocessable"


def _error_response(
    status_code: int, code: str, message: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    request_id = get_request_id()
    # The id in the header as well as the body. RequestContextMiddleware adds it to most
    # responses, but a 500 is sent by Starlette's outermost ServerErrorMiddleware, which
    # never passes through it.
    with_id = {REQUEST_ID_HEADER: request_id} if request_id else {}
    return JSONResponse(
        status_code=status_code,
        headers={**with_id, **(headers or {})},
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        },
    )


# Statuses raised as plain HTTPExceptions that deserve a code of their own.
_HTTP_ERROR_CODES = {status.HTTP_413_CONTENT_TOO_LARGE: "payload_too_large"}


def payload_too_large_response(message: str) -> JSONResponse:
    """413 for a body refused before any route ran (see app.core.limits)."""
    return _error_response(status.HTTP_413_CONTENT_TOO_LARGE, "payload_too_large", message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        # Expected failures — logged at info, because they are the system working.
        logger.info("domain_error code=%s message=%s", exc.code, exc.message)
        return _error_response(exc.status_code, exc.code, exc.message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        # loc looks like ("body", "title"); drop the source and keep the field path.
        field = ".".join(str(part) for part in first.get("loc", [])[1:]) or "request"
        detail = first.get("msg", "Invalid request")
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "validation_error",
            f"{field}: {detail}",
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # exc.headers carries what the status code requires — Allow on a 405.
        code = _HTTP_ERROR_CODES.get(exc.status_code, "http_error")
        return _error_response(
            exc.status_code, code, str(exc.detail), getattr(exc, "headers", None)
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        # Unexpected failures — logged with a stack trace, but the response says nothing
        # specific. Leaking an exception message can leak schema details or credentials.
        logger.exception("unhandled_error type=%s", type(exc).__name__)
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal_error",
            "An unexpected error occurred.",
        )
