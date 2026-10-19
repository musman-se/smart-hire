"""Errors raised by the applications domain — one per business rule, so a client can
tell exactly which rule refused it."""

from app.core.errors import ConflictError, NotFoundError, UnprocessableError


class ApplicationNotFoundError(NotFoundError):
    def __init__(self, application_id: object) -> None:
        super().__init__(f"Application {application_id} does not exist.")


class DuplicateApplicationError(ConflictError):
    code = "duplicate_application"


class ApplicationLimitReachedError(ConflictError):
    code = "application_limit_reached"


class JobCapacityReachedError(ConflictError):
    code = "job_capacity_reached"


class NotEligibleError(UnprocessableError):
    code = "not_eligible"


class InvalidStageTransitionError(ConflictError):
    code = "invalid_stage_transition"
