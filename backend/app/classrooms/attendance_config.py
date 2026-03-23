"""Attendance policy configuration and resolution.

Attendance rules cascade: classroom > program > tenant > hardcoded default.
If a level has no ``attendance`` key in its ``settings`` JSONB, the next level
is consulted until a definition is found.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

# ── Config model ──────────────────────────────────────────────────────────────

AttendanceMode = Literal["any_join", "minimum_duration", "percentage_duration"]

_DEFAULT_MODE: AttendanceMode = "any_join"
_DEFAULT_MIN_MINUTES: int = 15
_DEFAULT_PERCENTAGE: int = 75


class AttendanceConfig(BaseModel):
    """Attendance policy for a tenant / program / classroom."""

    enabled: bool = Field(
        True,
        description="Whether automatic attendance tracking is enabled for this level.",
    )
    mode: AttendanceMode = Field(
        _DEFAULT_MODE,
        description=(
            "Rule used to determine presence: "
            "'any_join' (connected at all), "
            "'minimum_duration' (connected for at least N minutes), or "
            "'percentage_duration' (connected for at least X% of session length)."
        ),
    )
    minimum_minutes: int = Field(
        _DEFAULT_MIN_MINUTES,
        ge=1,
        le=600,
        description="Minutes a student must be present (used by 'minimum_duration' mode).",
    )
    percentage: int = Field(
        _DEFAULT_PERCENTAGE,
        ge=1,
        le=100,
        description="Percentage of session length a student must be present (used by 'percentage_duration' mode).",
    )


# Hardcoded fallback applied when no level defines an attendance policy.
DEFAULT_ATTENDANCE_CONFIG = AttendanceConfig()


# ── Resolution ────────────────────────────────────────────────────────────────


def _parse_config(settings: dict[str, Any] | None) -> AttendanceConfig | None:
    """Extract and validate attendance config from a settings dict, or return None."""
    if not settings:
        return None
    raw = settings.get("attendance")
    if not isinstance(raw, dict):
        return None
    try:
        return AttendanceConfig.model_validate(raw)
    except Exception:
        return None


def resolve_attendance_config(
    *,
    tenant_settings: dict[str, Any] | None,
    program_settings: dict[str, Any] | None,
    classroom_settings: dict[str, Any] | None,
) -> AttendanceConfig:
    """Return the effective attendance config following the cascade rule.

    Priority (highest → lowest):
      1. classroom
      2. program
      3. tenant
      4. hardcoded default (any_join, enabled)
    """
    for candidate in (classroom_settings, program_settings, tenant_settings):
        cfg = _parse_config(candidate)
        if cfg is not None:
            return cfg
    return DEFAULT_ATTENDANCE_CONFIG
