"""Shared route dependencies."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query

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
