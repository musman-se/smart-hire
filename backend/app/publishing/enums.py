"""Publishing enumerations."""

from enum import StrEnum


class SectionKind(StrEnum):
    """The parts a job description is broken into by the publishing workflow."""

    SUMMARY = "summary"
    RESPONSIBILITY = "responsibility"
    REQUIREMENT = "requirement"
    BENEFIT = "benefit"
