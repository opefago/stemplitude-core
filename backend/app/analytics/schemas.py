"""Pydantic schemas for tenant analytics API responses."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

DimensionType = Literal["all", "program", "course", "classroom", "instructor"]


class AnalyticsTotals(BaseModel):
    enrolled_students: int = 0
    active_students: int = 0
    lesson_completions: int = 0
    lab_completions: int = 0
    lesson_progress_updates: int = 0
    lab_progress_updates: int = 0
    assignments_submitted: int = 0
    assignments_saved: int = 0
    assignments_on_time: int = 0
    assignments_late: int = 0
    assignments_graded: int = 0
    attendance_present: int = 0
    attendance_total: int = 0
    presence_records: int = 0
    median_assignment_score: float | None = None
    mean_assignment_score: float | None = None
    mean_rubric_compliance: float | None = Field(
        default=None,
        description="Mean rubric points/max ratio when rubric rows were submitted with grades.",
    )


class AnalyticsSummaryResponse(BaseModel):
    """Aggregated metrics over ``[date_from, date_to]`` for one slice."""

    tenant_id: str
    dimension: DimensionType
    dimension_key: str | None = None
    date_from: date
    date_to: date
    totals: AnalyticsTotals
    submission_rate: float | None = Field(
        default=None,
        description="submitted / (submitted + saved) when denominator > 0",
    )
    on_time_rate: float | None = Field(
        default=None,
        description="on_time / (on_time + late) when denominator > 0",
    )
    attendance_rate: float | None = Field(
        default=None,
        description="present / total attendance marks when denominator > 0",
    )
    grading_rate: float | None = Field(
        default=None,
        description="graded / submitted when submissions > 0",
    )
    suppressed: bool = Field(
        default=False,
        description="True when cohort is below minimum size for comparative display",
    )
    last_computed_at: datetime | None = Field(
        default=None,
        description="Latest computed_at among rollup rows matching this request's date range and slice.",
    )
    rollup_last_completed_at: datetime | None = Field(
        default=None,
        description="Latest computed_at for this tenant across all stored rollup rows (any date/dimension).",
    )


class AnalyticsBreakdownRow(BaseModel):
    dimension_key: str
    totals: AnalyticsTotals
    submission_rate: float | None = None
    on_time_rate: float | None = None
    attendance_rate: float | None = None
    grading_rate: float | None = None
    suppressed: bool = False


class AnalyticsBreakdownResponse(BaseModel):
    tenant_id: str
    dimension: DimensionType
    date_from: date
    date_to: date
    rows: list[AnalyticsBreakdownRow]
    last_computed_at: datetime | None = None
    rollup_last_completed_at: datetime | None = None


class AnalyticsCompareResponse(BaseModel):
    tenant_id: str
    dimension: DimensionType
    date_from: date
    date_to: date
    series: list[AnalyticsBreakdownRow]
    last_computed_at: datetime | None = None
    rollup_last_completed_at: datetime | None = None


class DimensionLabelItem(BaseModel):
    id: str
    label: str


class DimensionLabelsResponse(BaseModel):
    tenant_id: str
    dimension: Literal["program", "course", "classroom", "instructor"]
    items: list[DimensionLabelItem]


class AnalyticsTimeseriesPoint(BaseModel):
    """One UTC calendar day, tenant-wide slice (``dimension=all``, ``dimension_key=_``)."""

    bucket_date: date
    active_students: int = 0
    lesson_completions: int = 0
    lab_completions: int = 0
    assignments_submitted: int = 0
    assignments_saved: int = 0
    assignments_graded: int = 0
    assignments_on_time: int = 0
    assignments_late: int = 0
    attendance_present: int = 0
    attendance_total: int = 0
    submission_rate: float | None = None
    on_time_rate: float | None = None
    attendance_rate: float | None = None
    grading_rate: float | None = None
    mean_assignment_score: float | None = None


class AnalyticsTimeseriesResponse(BaseModel):
    tenant_id: str
    date_from: date
    date_to: date
    points: list[AnalyticsTimeseriesPoint]
    rollup_last_completed_at: datetime | None = None
