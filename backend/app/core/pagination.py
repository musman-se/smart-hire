"""Pagination: the query parameters going in, and the page envelope coming out."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import BaseModel, Field

from app.core.config import settings


@dataclass(slots=True)
class Pagination:
    limit: int
    offset: int


def pagination_params(
    limit: Annotated[
        int,
        Query(ge=1, le=settings.max_page_size, description="Rows per page"),
    ] = settings.default_page_size,
    offset: Annotated[int, Query(ge=0, description="Rows to skip")] = 0,
) -> Pagination:
    """Offset pagination, with a ceiling on limit.

    The ceiling matters: without it a client can ask for a million rows and pull the
    whole table into memory. Offset pagination drifts when rows are inserted mid-scroll
    — acceptable here, and the reason keyset pagination exists for large datasets.
    """
    return Pagination(limit=limit, offset=offset)


PaginationDep = Annotated[Pagination, Depends(pagination_params)]


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

    @classmethod
    def of(cls, rows: Sequence[Any], total: int, pagination: Pagination) -> "Page[T]":
        """Build a page from ORM rows. Each row is validated into the item schema `T`,
        which is where serialization happens — see `from_attributes` on the read schemas.
        """
        return cls(items=rows, total=total, limit=pagination.limit, offset=pagination.offset)
