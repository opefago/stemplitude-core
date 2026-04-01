"""Tenant analytics HTTP API (rollup reads + CSV export)."""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.deps import require_tenant_analytics_export, require_tenant_analytics_view
from app.analytics.metrics_catalog import VALID_DIMENSIONS
from app.analytics.service import TenantAnalyticsService
from app.database import get_db
from app.dependencies import TenantContext

from .schemas import (
    AnalyticsBreakdownResponse,
    AnalyticsCompareResponse,
    AnalyticsSummaryResponse,
    AnalyticsTimeseriesResponse,
    DimensionLabelsResponse,
)

router = APIRouter()


def _tenant(request: Request) -> TenantContext:
    t = getattr(request.state, "tenant", None)
    if t is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Tenant-ID required")
    return t


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def analytics_summary(
    request: Request,
    date_from: Annotated[date, Query(description="Inclusive start (UTC date)")],
    date_to: Annotated[date, Query(description="Inclusive end (UTC date)")],
    dimension: Annotated[str, Query(description="all | program | course | classroom | instructor")] = "all",
    dimension_key: Annotated[str | None, Query(description="Slice id; omit for tenant-wide")] = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_view),
):
    if dimension not in VALID_DIMENSIONS:
        raise HTTPException(status_code=400, detail="Invalid dimension")
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    return await svc.summary(
        tenant_id=tenant.tenant_id,
        date_from=date_from,
        date_to=date_to,
        dimension=dimension,
        dimension_key=dimension_key,
    )


@router.get("/timeseries", response_model=AnalyticsTimeseriesResponse)
async def analytics_timeseries(
    request: Request,
    date_from: Annotated[date, Query(description="Inclusive start (UTC date)")],
    date_to: Annotated[date, Query(description="Inclusive end (UTC date)")],
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_view),
):
    """Daily tenant-wide metrics for trend charts (``dimension=all`` rows only)."""
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    return await svc.timeseries(
        tenant_id=tenant.tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/dimension-labels", response_model=DimensionLabelsResponse)
async def analytics_dimension_labels(
    request: Request,
    dimension: Annotated[str, Query(description="program | course | classroom | instructor")],
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_view),
):
    allowed = {"program", "course", "classroom", "instructor"}
    if dimension not in allowed:
        raise HTTPException(status_code=400, detail="Invalid dimension")
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    try:
        return await svc.dimension_labels(tenant_id=tenant.tenant_id, dimension=dimension)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/breakdown", response_model=AnalyticsBreakdownResponse)
async def analytics_breakdown(
    request: Request,
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
    dimension: Annotated[str, Query()],
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_view),
):
    if dimension not in VALID_DIMENSIONS or dimension == "all":
        raise HTTPException(status_code=400, detail="dimension must be program, course, classroom, or instructor")
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    return await svc.breakdown(
        tenant_id=tenant.tenant_id,
        date_from=date_from,
        date_to=date_to,
        dimension=dimension,
    )


@router.get("/compare", response_model=AnalyticsCompareResponse)
async def analytics_compare(
    request: Request,
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
    dimension: Annotated[str, Query()],
    ids: Annotated[str, Query(description="Comma-separated dimension_key UUIDs, max 4")],
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_view),
):
    if dimension not in VALID_DIMENSIONS or dimension == "all":
        raise HTTPException(status_code=400, detail="invalid dimension")
    keys = [k.strip() for k in ids.split(",") if k.strip()]
    if len(keys) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two ids")
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    return await svc.compare(
        tenant_id=tenant.tenant_id,
        date_from=date_from,
        date_to=date_to,
        dimension=dimension,
        dimension_keys=keys,
    )


@router.get("/export.csv")
async def analytics_export_csv(
    request: Request,
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_tenant_analytics_export),
):
    tenant = _tenant(request)
    svc = TenantAnalyticsService(db)
    rows = await svc.rollup_rows_for_export(
        tenant_id=tenant.tenant_id,
        date_from=date_from,
        date_to=date_to,
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "bucket_date",
            "dimension",
            "dimension_key",
            "enrolled_students",
            "active_students",
            "lesson_completions",
            "lab_completions",
            "lesson_progress_updates",
            "lab_progress_updates",
            "assignments_submitted",
            "assignments_saved",
            "assignments_on_time",
            "assignments_late",
            "attendance_present",
            "attendance_total",
            "presence_records",
            "median_lesson_score",
            "median_lab_score",
            "mean_lesson_score",
            "mean_lab_score",
            "assignments_graded",
            "median_assignment_score",
            "mean_assignment_score",
            "mean_rubric_compliance",
            "computed_at",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r.bucket_date.isoformat(),
                r.dimension,
                r.dimension_key,
                r.enrolled_students,
                r.active_students,
                r.lesson_completions,
                r.lab_completions,
                r.lesson_progress_updates,
                r.lab_progress_updates,
                r.assignments_submitted,
                r.assignments_saved,
                r.assignments_on_time,
                r.assignments_late,
                r.attendance_present,
                r.attendance_total,
                r.presence_records,
                float(r.median_lesson_score) if r.median_lesson_score is not None else "",
                float(r.median_lab_score) if r.median_lab_score is not None else "",
                float(r.mean_lesson_score) if r.mean_lesson_score is not None else "",
                float(r.mean_lab_score) if r.mean_lab_score is not None else "",
                r.assignments_graded,
                float(r.median_assignment_score) if r.median_assignment_score is not None else "",
                float(r.mean_assignment_score) if r.mean_assignment_score is not None else "",
                float(r.mean_rubric_compliance) if r.mean_rubric_compliance is not None else "",
                r.computed_at.isoformat() if r.computed_at else "",
            ]
        )
    from fastapi.responses import Response

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="tenant-analytics.csv"',
        },
    )
