"""Shared response shapes."""

from pydantic import BaseModel, Field


# PEP 695 generic syntax — `class Page[T]` replaces the older TypeVar plus Generic[T].
# Python 3.12+ only, which this project already requires.
class Page[T](BaseModel):
    """A page of results.

    Returning a bare list would leave a client unable to tell "20 results" from "20 of
    340". `total` is the count matching the filter, ignoring limit and offset.
    """

    items: list[T]
    total: int = Field(description="Total rows matching the filter, ignoring pagination")
    limit: int
    offset: int


class ErrorBody(BaseModel):
    code: str = Field(description="Stable machine-readable identifier, safe to branch on")
    message: str = Field(description="Human-readable explanation")
    request_id: str | None = Field(default=None, description="Correlates with server logs")


class ErrorResponse(BaseModel):
    """Every error from this API has this shape, including validation failures."""

    error: ErrorBody
