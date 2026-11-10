"""Schema base classes and response shapes shared by every domain."""

from typing import Annotated, Any, ClassVar, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.core.names import FULL_NAME_MAX_LENGTH, FULL_NAME_MIN_LENGTH

NUL_MESSAGE = "text may not contain the NUL character"


def _reject_nul_in_text(value: str) -> str:
    if "\x00" in value:
        raise ValueError(NUL_MESSAGE)
    return value


# A free-text query parameter (?search=, ?skill=). Request bodies are checked for NUL by
# InputModel; query strings are not bodies, so they get this instead — without it,
# "?search=a%00b" reached Postgres and came back as a 500. Bounded, because the value
# ends up in an ILIKE pattern.
# Plain pydantic, not fastapi.Query: the models import this module (for ReadModel's
# neighbours), and the model layer must not pull in the web framework.
QueryText = Annotated[str, StringConstraints(max_length=200), AfterValidator(_reject_nul_in_text)]


# A person's full name, wherever one is typed: registration, a candidate's profile, a
# recruiter's or admin's profile, the command line. Trimmed *before* the length is
# checked, so surrounding spaces never count against the limit and "   " is refused.
# The numbers live in app.core.names, which the models share.


def normalise_full_name(value: str) -> str:
    value = value.strip()
    if not FULL_NAME_MIN_LENGTH <= len(value) <= FULL_NAME_MAX_LENGTH:
        raise ValueError(
            f"The name must be {FULL_NAME_MIN_LENGTH} to {FULL_NAME_MAX_LENGTH} characters."
        )
    return value


FullName = Annotated[
    str,
    AfterValidator(normalise_full_name),
    # The bounds again, for the OpenAPI schema only: the validator above enforces them.
    Field(json_schema_extra={"minLength": FULL_NAME_MIN_LENGTH, "maxLength": FULL_NAME_MAX_LENGTH}),
]


def contains_pattern(term: str) -> str:
    """An ILIKE pattern matching `term` anywhere, with the wildcards in it escaped:
    "100%" finds "100%", not everything that starts with "100". Use with
    `.ilike(contains_pattern(term), escape="\\")`, which a trigram index still serves.
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


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


class InputModel(BaseModel):
    """Base for every request body.

    Rejects the NUL character in any text. Postgres cannot store it in a text column, so
    without this check the request passes validation and then fails in the database as a
    500, instead of a 422 naming the problem.
    """

    @model_validator(mode="before")
    @classmethod
    def _reject_nul(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for value in data.values():
                texts = value if isinstance(value, list) else [value]
                for text in texts:
                    if isinstance(text, str):
                        _reject_nul_in_text(text)
        return data


class PatchModel(InputModel):
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
