"""Resolve the student UI mode from a three-level priority chain:
1. Per-student override (StudentMembership.ui_mode_override)
2. Tenant-level setting (tenant.settings["ui"]["ui_mode"])
3. Age-based default (from Student.date_of_birth)
"""

from __future__ import annotations

from datetime import date

VALID_MODES = {"kids", "explorer", "pro"}


def _age_from_dob(dob: date | None) -> int | None:
    if dob is None:
        return None
    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age


def _age_to_mode(dob: date | None) -> str:
    age = _age_from_dob(dob)
    if age is None:
        return "pro"
    if age <= 10:
        return "kids"
    if age <= 16:
        return "explorer"
    return "pro"


def resolve_ui_mode(
    *,
    student_dob: date | None,
    membership_override: str | None,
    tenant_settings: dict | None,
) -> tuple[str, str]:
    """Return (mode, source) where source indicates which level determined the mode.

    source is one of: "student", "tenant", "age".
    """
    if membership_override and membership_override in VALID_MODES:
        return membership_override, "student"

    tenant_mode = (tenant_settings or {}).get("ui", {}).get("ui_mode", "auto")
    if tenant_mode != "auto" and tenant_mode in VALID_MODES:
        return tenant_mode, "tenant"

    return _age_to_mode(student_dob), "age"
