"""Schema base classes and response shapes shared by every domain."""

from typing import ClassVar, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class PatchModel(BaseModel):
    """Base for PATCH bodies.

    Every field is optional, because PATCH means "change only what I send". That makes
    two different requests look alike — omitting a field, and sending it as null — and
    the service tells them apart with model_dump(exclude_unset=True).

    The trap is a field the database requires. Omitted, it is left alone; sent as null,
    it reached Postgres as NULL and came back as a 500 from the NOT NULL constraint.
    Subclasses list those fields in `not_nullable`, and null is refused here, as a 422
    naming the field, before any SQL runs.
    """

    not_nullable: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_null_for_required_columns(self) -> Self:
        for name in sorted(self.model_fields_set & self.not_nullable):
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null; omit it to leave it unchanged")
        return self
