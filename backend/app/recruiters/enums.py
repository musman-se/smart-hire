"""Recruiter enumerations."""

from enum import StrEnum


class StaffStatus(StrEnum):
    """Where a staff account stands, as the admin's team page shows it. Derived from the
    account, never stored: deactivated_at set, or no password yet, or neither."""

    ACTIVE = "active"
    INVITED = "invited"
    DEACTIVATED = "deactivated"
