"""Response shapes shared by every domain."""

from pydantic import BaseModel, ConfigDict, Field


class ReadModel(BaseModel):
    """Base for every schema the API returns.

    `from_attributes=True` is what lets Pydantic read a SQLAlchemy object directly —
    `JobRead.model_validate(job)` reads `job.title` as an attribute rather than expecting
    a dict. That is the whole of serialization in this API: ORM object -> read schema ->
    JSON, with the read schema deciding which attributes leave the building.
    """

    model_config = ConfigDict(from_attributes=True)


class ErrorBody(BaseModel):
    code: str = Field(description="Stable machine-readable identifier, safe to branch on")
    message: str = Field(description="Human-readable explanation")
    request_id: str | None = Field(default=None, description="Correlates with server logs")


class ErrorResponse(BaseModel):
    """Every error from this API has this shape, including validation failures."""

    error: ErrorBody
