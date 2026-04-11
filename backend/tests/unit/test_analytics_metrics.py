"""Unit checks for tenant analytics constants and helpers."""

from datetime import date

from pytest import approx

from app.analytics.metrics_catalog import (
    MAX_ANALYTICS_RANGE_DAYS,
    MAX_COMPARE_IDS,
    MIN_COHORT_SIZE_FOR_BREAKDOWN,
    VALID_DIMENSIONS,
)
from app.analytics.schemas import AnalyticsTimeseriesPoint, AnalyticsTimeseriesResponse, AnalyticsTotals
from app.analytics.service import _rates


def test_metric_constants():
    assert MIN_COHORT_SIZE_FOR_BREAKDOWN >= 3
    assert MAX_ANALYTICS_RANGE_DAYS >= 30
    assert MAX_COMPARE_IDS >= 2
    assert "all" in VALID_DIMENSIONS
    assert "program" in VALID_DIMENSIONS


def test_rates_helpers():
    t = AnalyticsTotals(
        assignments_submitted=3,
        assignments_saved=1,
        assignments_on_time=2,
        assignments_late=2,
        attendance_present=8,
        attendance_total=10,
    )
    sub, ot, att = _rates(t)
    assert sub == approx(0.75)
    assert ot == approx(0.5)
    assert att == approx(0.8)


def test_timeseries_schema_roundtrip():
    p = AnalyticsTimeseriesPoint(
        bucket_date=date(2026, 3, 1),
        active_students=4,
        assignments_submitted=2,
        grading_rate=0.5,
    )
    body = AnalyticsTimeseriesResponse(
        tenant_id="t1",
        date_from=date(2026, 3, 1),
        date_to=date(2026, 3, 31),
        points=[p],
        rollup_last_completed_at=None,
    )
    dumped = body.model_dump(mode="json")
    assert dumped["points"][0]["bucket_date"] == "2026-03-01"
    assert dumped["points"][0]["grading_rate"] == 0.5
