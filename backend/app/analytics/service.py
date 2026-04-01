"""Read-only queries over ``tenant_analytics_daily`` rollups."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.metrics_catalog import (
    DIMENSION_ALL,
    MAX_ANALYTICS_RANGE_DAYS,
    MAX_COMPARE_IDS,
    MIN_COHORT_SIZE_FOR_BREAKDOWN,
)
from app.analytics.models import TenantAnalyticsDaily
from app.analytics.schemas import (
    AnalyticsBreakdownResponse,
    AnalyticsBreakdownRow,
    AnalyticsCompareResponse,
    AnalyticsSummaryResponse,
    AnalyticsTimeseriesPoint,
    AnalyticsTimeseriesResponse,
    AnalyticsTotals,
    DimensionLabelItem,
    DimensionLabelsResponse,
)


def _grading_rate(totals: AnalyticsTotals) -> float | None:
    if totals.assignments_submitted <= 0:
        return None
    return min(1.0, totals.assignments_graded / totals.assignments_submitted)


def _rates(totals: AnalyticsTotals) -> tuple[float | None, float | None, float | None]:
    sub_denom = totals.assignments_submitted + totals.assignments_saved
    submission_rate = (
        totals.assignments_submitted / sub_denom if sub_denom > 0 else None
    )
    time_denom = totals.assignments_on_time + totals.assignments_late
    on_time_rate = totals.assignments_on_time / time_denom if time_denom > 0 else None
    att_rate = (
        totals.attendance_present / totals.attendance_total
        if totals.attendance_total > 0
        else None
    )
    return submission_rate, on_time_rate, att_rate


def _parse_range(date_from: date, date_to: date) -> tuple[date, date]:
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    span = (date_to - date_from).days + 1
    if span > MAX_ANALYTICS_RANGE_DAYS:
        date_from = date_to - timedelta(days=MAX_ANALYTICS_RANGE_DAYS - 1)
    return date_from, date_to


class TenantAnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _rollup_last_completed_at(self, tenant_id: UUID) -> datetime | None:
        q = select(func.max(TenantAnalyticsDaily.computed_at)).where(
            TenantAnalyticsDaily.tenant_id == tenant_id,
        )
        return (await self.session.execute(q)).scalar_one_or_none()

    async def summary(
        self,
        *,
        tenant_id: UUID,
        date_from: date,
        date_to: date,
        dimension: str,
        dimension_key: str | None,
    ) -> AnalyticsSummaryResponse:
        date_from, date_to = _parse_range(date_from, date_to)
        key = dimension_key if dimension_key is not None else "_"
        if dimension == "all":
            key = "_"

        q = select(
            func.coalesce(func.max(TenantAnalyticsDaily.enrolled_students), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.active_students), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.lesson_completions), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.lab_completions), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.lesson_progress_updates), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.lab_progress_updates), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.assignments_submitted), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.assignments_saved), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.assignments_on_time), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.assignments_late), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.attendance_present), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.attendance_total), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.presence_records), 0),
            func.coalesce(func.sum(TenantAnalyticsDaily.assignments_graded), 0),
            func.avg(TenantAnalyticsDaily.median_assignment_score),
            func.avg(TenantAnalyticsDaily.mean_assignment_score),
            func.avg(TenantAnalyticsDaily.mean_rubric_compliance),
            func.max(TenantAnalyticsDaily.computed_at),
        ).where(
            TenantAnalyticsDaily.tenant_id == tenant_id,
            TenantAnalyticsDaily.bucket_date >= date_from,
            TenantAnalyticsDaily.bucket_date <= date_to,
            TenantAnalyticsDaily.dimension == dimension,
            TenantAnalyticsDaily.dimension_key == key,
        )
        row = (await self.session.execute(q)).one()
        totals = AnalyticsTotals(
            enrolled_students=int(row[0] or 0),
            active_students=int(row[1] or 0),
            lesson_completions=int(row[2] or 0),
            lab_completions=int(row[3] or 0),
            lesson_progress_updates=int(row[4] or 0),
            lab_progress_updates=int(row[5] or 0),
            assignments_submitted=int(row[6] or 0),
            assignments_saved=int(row[7] or 0),
            assignments_on_time=int(row[8] or 0),
            assignments_late=int(row[9] or 0),
            assignments_graded=int(row[10] or 0),
            attendance_present=int(row[11] or 0),
            attendance_total=int(row[12] or 0),
            presence_records=int(row[13] or 0),
            median_assignment_score=float(row[14]) if row[14] is not None else None,
            mean_assignment_score=float(row[15]) if row[15] is not None else None,
            mean_rubric_compliance=float(row[16]) if row[16] is not None else None,
        )
        last_computed: datetime | None = row[17]
        sub_r, ot_r, att_r = _rates(totals)
        gr = _grading_rate(totals)
        suppressed = (
            dimension != "all"
            and 0 < totals.enrolled_students < MIN_COHORT_SIZE_FOR_BREAKDOWN
        )

        rollup_last = await self._rollup_last_completed_at(tenant_id)

        return AnalyticsSummaryResponse(
            tenant_id=str(tenant_id),
            dimension=dimension,  # type: ignore[arg-type]
            dimension_key=None if key == "_" else key,
            date_from=date_from,
            date_to=date_to,
            totals=totals,
            submission_rate=sub_r,
            on_time_rate=ot_r,
            attendance_rate=att_r,
            grading_rate=gr,
            suppressed=suppressed,
            last_computed_at=last_computed,
            rollup_last_completed_at=rollup_last,
        )

    async def timeseries(
        self,
        *,
        tenant_id: UUID,
        date_from: date,
        date_to: date,
    ) -> AnalyticsTimeseriesResponse:
        """Daily tenant-wide metrics (one rollup row per UTC day when rebuild has run)."""
        date_from, date_to = _parse_range(date_from, date_to)
        q = (
            select(TenantAnalyticsDaily)
            .where(
                TenantAnalyticsDaily.tenant_id == tenant_id,
                TenantAnalyticsDaily.bucket_date >= date_from,
                TenantAnalyticsDaily.bucket_date <= date_to,
                TenantAnalyticsDaily.dimension == DIMENSION_ALL,
                TenantAnalyticsDaily.dimension_key == "_",
            )
            .order_by(TenantAnalyticsDaily.bucket_date)
        )
        raw = list((await self.session.execute(q)).scalars().all())
        rollup_last = await self._rollup_last_completed_at(tenant_id)
        points: list[AnalyticsTimeseriesPoint] = []
        for r in raw:
            totals = AnalyticsTotals(
                enrolled_students=r.enrolled_students,
                active_students=r.active_students,
                lesson_completions=r.lesson_completions,
                lab_completions=r.lab_completions,
                lesson_progress_updates=r.lesson_progress_updates,
                lab_progress_updates=r.lab_progress_updates,
                assignments_submitted=r.assignments_submitted,
                assignments_saved=r.assignments_saved,
                assignments_on_time=r.assignments_on_time,
                assignments_late=r.assignments_late,
                assignments_graded=r.assignments_graded,
                attendance_present=r.attendance_present,
                attendance_total=r.attendance_total,
                presence_records=r.presence_records,
                median_assignment_score=float(r.median_assignment_score)
                if r.median_assignment_score is not None
                else None,
                mean_assignment_score=float(r.mean_assignment_score)
                if r.mean_assignment_score is not None
                else None,
                mean_rubric_compliance=float(r.mean_rubric_compliance)
                if r.mean_rubric_compliance is not None
                else None,
            )
            sub_r, ot_r, att_r = _rates(totals)
            gr = _grading_rate(totals)
            points.append(
                AnalyticsTimeseriesPoint(
                    bucket_date=r.bucket_date,
                    active_students=r.active_students,
                    lesson_completions=r.lesson_completions,
                    lab_completions=r.lab_completions,
                    assignments_submitted=r.assignments_submitted,
                    assignments_saved=r.assignments_saved,
                    assignments_graded=r.assignments_graded,
                    assignments_on_time=r.assignments_on_time,
                    assignments_late=r.assignments_late,
                    attendance_present=r.attendance_present,
                    attendance_total=r.attendance_total,
                    submission_rate=sub_r,
                    on_time_rate=ot_r,
                    attendance_rate=att_r,
                    grading_rate=gr,
                    mean_assignment_score=float(r.mean_assignment_score)
                    if r.mean_assignment_score is not None
                    else None,
                )
            )
        return AnalyticsTimeseriesResponse(
            tenant_id=str(tenant_id),
            date_from=date_from,
            date_to=date_to,
            points=points,
            rollup_last_completed_at=rollup_last,
        )

    async def breakdown(
        self,
        *,
        tenant_id: UUID,
        date_from: date,
        date_to: date,
        dimension: str,
    ) -> AnalyticsBreakdownResponse:
        if dimension == "all":
            raise ValueError("Use summary for dimension=all")
        date_from, date_to = _parse_range(date_from, date_to)

        q = (
            select(
                TenantAnalyticsDaily.dimension_key,
                func.coalesce(func.max(TenantAnalyticsDaily.enrolled_students), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.active_students), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.lesson_completions), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.lab_completions), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.lesson_progress_updates), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.lab_progress_updates), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.assignments_submitted), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.assignments_saved), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.assignments_on_time), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.assignments_late), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.attendance_present), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.attendance_total), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.presence_records), 0),
                func.coalesce(func.sum(TenantAnalyticsDaily.assignments_graded), 0),
                func.avg(TenantAnalyticsDaily.median_assignment_score),
                func.avg(TenantAnalyticsDaily.mean_assignment_score),
                func.avg(TenantAnalyticsDaily.mean_rubric_compliance),
            )
            .where(
                TenantAnalyticsDaily.tenant_id == tenant_id,
                TenantAnalyticsDaily.bucket_date >= date_from,
                TenantAnalyticsDaily.bucket_date <= date_to,
                TenantAnalyticsDaily.dimension == dimension,
            )
            .group_by(TenantAnalyticsDaily.dimension_key)
        )
        rows_raw = (await self.session.execute(q)).all()
        last_q = select(func.max(TenantAnalyticsDaily.computed_at)).where(
            TenantAnalyticsDaily.tenant_id == tenant_id,
            TenantAnalyticsDaily.bucket_date >= date_from,
            TenantAnalyticsDaily.bucket_date <= date_to,
            TenantAnalyticsDaily.dimension == dimension,
        )
        last_computed = (await self.session.execute(last_q)).scalar_one_or_none()
        rollup_last = await self._rollup_last_completed_at(tenant_id)

        out_rows: list[AnalyticsBreakdownRow] = []
        for r in rows_raw:
            totals = AnalyticsTotals(
                enrolled_students=int(r[1] or 0),
                active_students=int(r[2] or 0),
                lesson_completions=int(r[3] or 0),
                lab_completions=int(r[4] or 0),
                lesson_progress_updates=int(r[5] or 0),
                lab_progress_updates=int(r[6] or 0),
                assignments_submitted=int(r[7] or 0),
                assignments_saved=int(r[8] or 0),
                assignments_on_time=int(r[9] or 0),
                assignments_late=int(r[10] or 0),
                assignments_graded=int(r[11] or 0),
                attendance_present=int(r[12] or 0),
                attendance_total=int(r[13] or 0),
                presence_records=int(r[14] or 0),
                median_assignment_score=float(r[15]) if r[15] is not None else None,
                mean_assignment_score=float(r[16]) if r[16] is not None else None,
                mean_rubric_compliance=float(r[17]) if r[17] is not None else None,
            )
            sub_r, ot_r, att_r = _rates(totals)
            gr = _grading_rate(totals)
            suppressed = 0 < totals.enrolled_students < MIN_COHORT_SIZE_FOR_BREAKDOWN
            out_rows.append(
                AnalyticsBreakdownRow(
                    dimension_key=r[0],
                    totals=totals,
                    submission_rate=sub_r,
                    on_time_rate=ot_r,
                    attendance_rate=att_r,
                    grading_rate=gr,
                    suppressed=suppressed,
                )
            )

        return AnalyticsBreakdownResponse(
            tenant_id=str(tenant_id),
            dimension=dimension,  # type: ignore[arg-type]
            date_from=date_from,
            date_to=date_to,
            rows=sorted(out_rows, key=lambda x: x.dimension_key),
            last_computed_at=last_computed,
            rollup_last_completed_at=rollup_last,
        )

    async def compare(
        self,
        *,
        tenant_id: UUID,
        date_from: date,
        date_to: date,
        dimension: str,
        dimension_keys: list[str],
    ) -> AnalyticsCompareResponse:
        if len(dimension_keys) > MAX_COMPARE_IDS:
            dimension_keys = dimension_keys[:MAX_COMPARE_IDS]
        date_from, date_to = _parse_range(date_from, date_to)
        rollup_last = await self._rollup_last_completed_at(tenant_id)
        series: list[AnalyticsBreakdownRow] = []
        last_max: datetime | None = None
        for key in dimension_keys:
            s = await self.summary(
                tenant_id=tenant_id,
                date_from=date_from,
                date_to=date_to,
                dimension=dimension,
                dimension_key=key,
            )
            if s.last_computed_at and (last_max is None or s.last_computed_at > last_max):
                last_max = s.last_computed_at
            sub_r, ot_r, att_r = _rates(s.totals)
            gr = _grading_rate(s.totals)
            series.append(
                AnalyticsBreakdownRow(
                    dimension_key=key,
                    totals=s.totals,
                    submission_rate=sub_r,
                    on_time_rate=ot_r,
                    attendance_rate=att_r,
                    grading_rate=gr,
                    suppressed=s.suppressed,
                )
            )
        return AnalyticsCompareResponse(
            tenant_id=str(tenant_id),
            dimension=dimension,  # type: ignore[arg-type]
            date_from=date_from,
            date_to=date_to,
            series=series,
            last_computed_at=last_max,
            rollup_last_completed_at=rollup_last,
        )

    async def rollup_rows_for_export(
        self,
        *,
        tenant_id: UUID,
        date_from: date,
        date_to: date,
    ) -> list[TenantAnalyticsDaily]:
        date_from, date_to = _parse_range(date_from, date_to)
        q = (
            select(TenantAnalyticsDaily)
            .where(
                TenantAnalyticsDaily.tenant_id == tenant_id,
                TenantAnalyticsDaily.bucket_date >= date_from,
                TenantAnalyticsDaily.bucket_date <= date_to,
            )
            .order_by(
                TenantAnalyticsDaily.bucket_date,
                TenantAnalyticsDaily.dimension,
                TenantAnalyticsDaily.dimension_key,
            )
        )
        return list((await self.session.execute(q)).scalars().all())

    async def dimension_labels(self, *, tenant_id: UUID, dimension: str) -> DimensionLabelsResponse:
        from app.classrooms.models import Classroom
        from app.curriculum.models import Course
        from app.programs.models import Program
        from app.users.models import User

        items: list[DimensionLabelItem] = []
        if dimension == "program":
            res = await self.session.execute(
                select(Program.id, Program.name).where(
                    Program.tenant_id == tenant_id,
                    Program.is_active == True,  # noqa: E712
                )
            )
            for pid, name in res.all():
                items.append(DimensionLabelItem(id=str(pid), label=name or str(pid)))
        elif dimension == "course":
            res = await self.session.execute(
                select(Course.id, Course.title).where(
                    Course.tenant_id == tenant_id,
                )
            )
            for cid, title in res.all():
                items.append(DimensionLabelItem(id=str(cid), label=title or str(cid)))
        elif dimension == "classroom":
            res = await self.session.execute(
                select(Classroom.id, Classroom.name).where(
                    Classroom.tenant_id == tenant_id,
                    Classroom.deleted_at.is_(None),
                )
            )
            for cid, name in res.all():
                items.append(DimensionLabelItem(id=str(cid), label=name or str(cid)))
        elif dimension == "instructor":
            res = await self.session.execute(
                select(User.id, User.first_name, User.last_name)
                .join(Classroom, Classroom.instructor_id == User.id)
                .where(Classroom.tenant_id == tenant_id, Classroom.deleted_at.is_(None))
                .distinct()
            )
            for uid, fn, ln in res.all():
                label = f"{fn or ''} {ln or ''}".strip() or str(uid)
                items.append(DimensionLabelItem(id=str(uid), label=label))
        else:
            raise ValueError("invalid dimension for labels")

        items.sort(key=lambda x: x.label.lower())
        return DimensionLabelsResponse(tenant_id=str(tenant_id), dimension=dimension, items=items)  # type: ignore[arg-type]
