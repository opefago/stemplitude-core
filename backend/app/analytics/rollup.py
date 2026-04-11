"""Rebuild ``tenant_analytics_daily`` rows from OLTP facts (batch-only; no request path)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.metrics_catalog import DIMENSION_ALL, VALID_DIMENSIONS
from app.analytics.models import TenantAnalyticsDaily
from app.classrooms.models import (
    Classroom,
    ClassroomSession,
    ClassroomSessionEvent,
    ClassroomSessionPresence,
    ClassroomStudent,
)
from app.progress.models import Attendance, LabProgress, LessonProgress
from app.students.models import StudentMembership

logger = logging.getLogger(__name__)

UTC = timezone.utc


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, tzinfo=UTC)
    return start, start + timedelta(days=1)


async def rebuild_tenant_bucket_day(session: AsyncSession, tenant_id: UUID, bucket_date: date) -> None:
    """Delete and recompute all dimensional rows for one tenant + UTC day."""
    await session.execute(
        delete(TenantAnalyticsDaily).where(
            TenantAnalyticsDaily.tenant_id == tenant_id,
            TenantAnalyticsDaily.bucket_date == bucket_date,
        )
    )
    start, end = _day_bounds(bucket_date)
    now = datetime.now(UTC)

    rows: list[dict[str, Any]] = []

    # --- Tenant-wide slice (no enrollment filter) ---
    m_all = await _compute_metrics(session, tenant_id, start, end, student_ids=None)
    skip_keys = frozenset({"enrolled_tenant_active", "enrolled_students"})
    rows.append(
        _row_dict(
            tenant_id,
            bucket_date,
            DIMENSION_ALL,
            "_",
            enrolled_students=m_all["enrolled_tenant_active"],
            computed_at=now,
            **{k: v for k, v in m_all.items() if k not in skip_keys},
        )
    )

    # Distinct classrooms (active) for dimensional cohorts
    cr_result = await session.execute(
        select(Classroom).where(
            Classroom.tenant_id == tenant_id,
            Classroom.is_active == True,  # noqa: E712
            Classroom.deleted_at.is_(None),
        )
    )
    classrooms = list(cr_result.scalars().all())

    seen_room: set[UUID] = set()

    for room in classrooms:
        cohort = await _students_in_classroom(session, room.id)
        cid = room.id
        if cid not in seen_room:
            seen_room.add(cid)
            if cohort:
                m = await _compute_metrics(session, tenant_id, start, end, student_ids=cohort)
                rows.append(
                    _row_dict(
                        tenant_id,
                        bucket_date,
                        "classroom",
                        str(cid),
                        enrolled_students=len(cohort),
                        computed_at=now,
                        **{k: v for k, v in m.items() if k not in skip_keys},
                    )
                )
            else:
                rows.append(
                    _row_dict(
                        tenant_id,
                        bucket_date,
                        "classroom",
                        str(cid),
                        enrolled_students=0,
                        computed_at=now,
                        **_zero_metric_payload(),
                    )
                )

    program_ids = {c.program_id for c in classrooms if c.program_id}
    for pid in program_ids:
        prog_cohort = await _students_for_program(session, tenant_id, pid)
        if not prog_cohort:
            continue
        mp = await _compute_metrics(session, tenant_id, start, end, student_ids=prog_cohort)
        rows.append(
            _row_dict(
                tenant_id,
                bucket_date,
                "program",
                str(pid),
                enrolled_students=len(prog_cohort),
                computed_at=now,
                **{k: v for k, v in mp.items() if k not in skip_keys},
            )
        )

    course_ids = {c.curriculum_id for c in classrooms if c.curriculum_id}
    for cid in course_ids:
        course_cohort = await _students_for_course(session, tenant_id, cid)
        if not course_cohort:
            continue
        mc = await _compute_metrics(session, tenant_id, start, end, student_ids=course_cohort)
        rows.append(
            _row_dict(
                tenant_id,
                bucket_date,
                "course",
                str(cid),
                enrolled_students=len(course_cohort),
                computed_at=now,
                **{k: v for k, v in mc.items() if k not in skip_keys},
            )
        )

    instructor_ids = {c.instructor_id for c in classrooms if c.instructor_id}
    for iid in instructor_ids:
        instr_cohort = await _students_for_instructor(session, tenant_id, iid)
        if not instr_cohort:
            continue
        mi = await _compute_metrics(session, tenant_id, start, end, student_ids=instr_cohort)
        rows.append(
            _row_dict(
                tenant_id,
                bucket_date,
                "instructor",
                str(iid),
                enrolled_students=len(instr_cohort),
                computed_at=now,
                **{k: v for k, v in mi.items() if k not in skip_keys},
            )
        )

    if rows:
        await session.execute(insert(TenantAnalyticsDaily).values(rows))
    await session.flush()
    logger.info("analytics rollup tenant=%s day=%s rows=%s", tenant_id, bucket_date, len(rows))


def _zero_metric_payload() -> dict[str, Any]:
    z = _empty_metrics(0)
    return {k: v for k, v in z.items() if k not in frozenset({"enrolled_tenant_active", "enrolled_students"})}


def _row_dict(
    tenant_id: UUID,
    bucket_date: date,
    dimension: str,
    dimension_key: str,
    *,
    enrolled_students: int,
    computed_at: datetime,
    active_students: int,
    lesson_completions: int,
    lab_completions: int,
    lesson_progress_updates: int,
    lab_progress_updates: int,
    assignments_submitted: int,
    assignments_saved: int,
    assignments_on_time: int,
    assignments_late: int,
    attendance_present: int,
    attendance_total: int,
    presence_records: int,
    median_lesson_score: float | None,
    median_lab_score: float | None,
    mean_lesson_score: float | None,
    mean_lab_score: float | None,
    assignments_graded: int,
    median_assignment_score: float | None,
    mean_assignment_score: float | None,
    mean_rubric_compliance: float | None,
) -> dict[str, Any]:
    if dimension not in VALID_DIMENSIONS:
        raise ValueError(dimension)
    return {
        "tenant_id": tenant_id,
        "bucket_date": bucket_date,
        "dimension": dimension,
        "dimension_key": dimension_key,
        "enrolled_students": enrolled_students,
        "active_students": active_students,
        "lesson_completions": lesson_completions,
        "lab_completions": lab_completions,
        "lesson_progress_updates": lesson_progress_updates,
        "lab_progress_updates": lab_progress_updates,
        "assignments_submitted": assignments_submitted,
        "assignments_saved": assignments_saved,
        "assignments_on_time": assignments_on_time,
        "assignments_late": assignments_late,
        "attendance_present": attendance_present,
        "attendance_total": attendance_total,
        "presence_records": presence_records,
        "median_lesson_score": median_lesson_score,
        "median_lab_score": median_lab_score,
        "mean_lesson_score": mean_lesson_score,
        "mean_lab_score": mean_lab_score,
        "assignments_graded": assignments_graded,
        "median_assignment_score": median_assignment_score,
        "mean_assignment_score": mean_assignment_score,
        "mean_rubric_compliance": mean_rubric_compliance,
        "computed_at": computed_at,
    }


async def _grading_metrics(
    session: AsyncSession,
    tenant_id: UUID,
    start: datetime,
    end: datetime,
    student_ids: set[UUID] | None,
) -> tuple[int, float | None, float | None, float | None]:
    """Stats from ``instructor.submission.graded`` events (holistic score + optional rubric)."""
    cond = [
        ClassroomSessionEvent.tenant_id == tenant_id,
        ClassroomSessionEvent.event_type == "instructor.submission.graded",
        ClassroomSessionEvent.created_at >= start,
        ClassroomSessionEvent.created_at < end,
    ]
    if student_ids is not None:
        cond.append(ClassroomSessionEvent.student_id.in_(student_ids))

    r = await session.execute(select(ClassroomSessionEvent.metadata_).where(*cond))
    scores: list[int] = []
    rubric_fracs: list[float] = []
    for (meta,) in r.all():
        m = meta or {}
        sc = m.get("score")
        if isinstance(sc, (int, float)):
            scores.append(max(0, min(100, int(sc))))
        rub = m.get("rubric")
        if isinstance(rub, list) and rub:
            num = 0.0
            den = 0.0
            for c in rub:
                if not isinstance(c, dict):
                    continue
                try:
                    mx = float(c.get("max_points") or 0)
                    p = float(c.get("points_awarded") or 0)
                except (TypeError, ValueError):
                    continue
                if mx > 0:
                    num += min(p, mx)
                    den += mx
            if den > 0:
                rubric_fracs.append(num / den)

    n = len(scores)
    if n == 0:
        med_sc = mean_sc = None
    else:
        scores.sort()
        mid = n // 2
        med_sc = float(scores[mid] if n % 2 else (scores[mid - 1] + scores[mid]) / 2)
        mean_sc = float(sum(scores) / n)
    mean_rub = float(sum(rubric_fracs) / len(rubric_fracs)) if rubric_fracs else None
    return n, med_sc, mean_sc, mean_rub


async def _students_in_classroom(session: AsyncSession, classroom_id: UUID) -> set[UUID]:
    r = await session.execute(
        select(ClassroomStudent.student_id).where(ClassroomStudent.classroom_id == classroom_id)
    )
    return {row[0] for row in r.all()}


async def _students_for_program(session: AsyncSession, tenant_id: UUID, program_id: UUID) -> set[UUID]:
    r = await session.execute(
        select(ClassroomStudent.student_id)
        .join(Classroom, ClassroomStudent.classroom_id == Classroom.id)
        .where(
            Classroom.tenant_id == tenant_id,
            Classroom.program_id == program_id,
            Classroom.is_active == True,  # noqa: E712
            Classroom.deleted_at.is_(None),
        )
        .distinct()
    )
    return {row[0] for row in r.all()}


async def _students_for_course(session: AsyncSession, tenant_id: UUID, course_id: UUID) -> set[UUID]:
    r = await session.execute(
        select(ClassroomStudent.student_id)
        .join(Classroom, ClassroomStudent.classroom_id == Classroom.id)
        .where(
            Classroom.tenant_id == tenant_id,
            Classroom.curriculum_id == course_id,
            Classroom.is_active == True,  # noqa: E712
            Classroom.deleted_at.is_(None),
        )
        .distinct()
    )
    return {row[0] for row in r.all()}


async def _students_for_instructor(session: AsyncSession, tenant_id: UUID, instructor_id: UUID) -> set[UUID]:
    r = await session.execute(
        select(ClassroomStudent.student_id)
        .join(Classroom, ClassroomStudent.classroom_id == Classroom.id)
        .where(
            Classroom.tenant_id == tenant_id,
            Classroom.instructor_id == instructor_id,
            Classroom.is_active == True,  # noqa: E712
            Classroom.deleted_at.is_(None),
        )
        .distinct()
    )
    return {row[0] for row in r.all()}


async def _compute_metrics(
    session: AsyncSession,
    tenant_id: UUID,
    start: datetime,
    end: datetime,
    student_ids: set[UUID] | None,
) -> dict[str, Any]:
    """Aggregate metrics; ``student_ids`` None = tenant-wide (no filter on student)."""
    sm_filter = [StudentMembership.tenant_id == tenant_id, StudentMembership.is_active == True]  # noqa: E712
    enrolled_q = select(func.count()).select_from(StudentMembership).where(*sm_filter)
    enrolled_tenant_active = int((await session.execute(enrolled_q)).scalar_one() or 0)

    lp_base = [LessonProgress.tenant_id == tenant_id]
    lab_base = [LabProgress.tenant_id == tenant_id]
    if student_ids is not None:
        if not student_ids:
            z = _empty_metrics(0)
            z["enrolled_tenant_active"] = enrolled_tenant_active
            z["enrolled_students"] = 0
            return z
        lp_base.append(LessonProgress.student_id.in_(student_ids))
        lab_base.append(LabProgress.student_id.in_(student_ids))

    lesson_compl = await session.execute(
        select(func.count())
        .select_from(LessonProgress)
        .where(
            *lp_base,
            LessonProgress.completed_at.isnot(None),
            LessonProgress.completed_at >= start,
            LessonProgress.completed_at < end,
        )
    )
    lesson_completions = int(lesson_compl.scalar_one() or 0)

    lab_compl = await session.execute(
        select(func.count())
        .select_from(LabProgress)
        .where(
            *lab_base,
            LabProgress.completed_at.isnot(None),
            LabProgress.completed_at >= start,
            LabProgress.completed_at < end,
        )
    )
    lab_completions = int(lab_compl.scalar_one() or 0)

    lpu = await session.execute(
        select(func.count())
        .select_from(LessonProgress)
        .where(
            *lp_base,
            LessonProgress.updated_at >= start,
            LessonProgress.updated_at < end,
        )
    )
    lesson_progress_updates = int(lpu.scalar_one() or 0)

    lbpu = await session.execute(
        select(func.count())
        .select_from(LabProgress)
        .where(
            *lab_base,
            LabProgress.updated_at >= start,
            LabProgress.updated_at < end,
        )
    )
    lab_progress_updates = int(lbpu.scalar_one() or 0)

    # Active students: union of distinct student_ids from progress + session events + attendance + presence
    active: set[UUID] = set()
    for q in (
        select(LessonProgress.student_id).where(
            *lp_base,
            or_(
                and_(LessonProgress.updated_at >= start, LessonProgress.updated_at < end),
                and_(
                    LessonProgress.completed_at.isnot(None),
                    LessonProgress.completed_at >= start,
                    LessonProgress.completed_at < end,
                ),
            ),
        ),
        select(LabProgress.student_id).where(
            *lab_base,
            or_(
                and_(LabProgress.updated_at >= start, LabProgress.updated_at < end),
                and_(
                    LabProgress.completed_at.isnot(None),
                    LabProgress.completed_at >= start,
                    LabProgress.completed_at < end,
                ),
            ),
        ),
    ):
        r = await session.execute(q.distinct())
        active.update(row[0] for row in r.all())

    ev_base = [
        ClassroomSessionEvent.tenant_id == tenant_id,
        ClassroomSessionEvent.created_at >= start,
        ClassroomSessionEvent.created_at < end,
    ]
    if student_ids is not None:
        ev_base.append(ClassroomSessionEvent.actor_id.in_(student_ids))
        ev_base.append(ClassroomSessionEvent.actor_type == "student")

    subm = await session.execute(
        select(func.count())
        .select_from(ClassroomSessionEvent)
        .where(*ev_base, ClassroomSessionEvent.event_type == "student.submission.submitted")
    )
    assignments_submitted = int(subm.scalar_one() or 0)

    saved = await session.execute(
        select(func.count())
        .select_from(ClassroomSessionEvent)
        .where(*ev_base, ClassroomSessionEvent.event_type == "student.submission.saved")
    )
    assignments_saved = int(saved.scalar_one() or 0)

    # On-time / late: submitted events joined to session end
    ot_base = ev_base + [ClassroomSessionEvent.event_type == "student.submission.submitted"]
    on_time = await session.execute(
        select(func.count())
        .select_from(ClassroomSessionEvent)
        .join(ClassroomSession, ClassroomSessionEvent.session_id == ClassroomSession.id)
        .where(
            *ot_base,
            ClassroomSessionEvent.created_at <= ClassroomSession.session_end,
        )
    )
    assignments_on_time = int(on_time.scalar_one() or 0)
    late = await session.execute(
        select(func.count())
        .select_from(ClassroomSessionEvent)
        .join(ClassroomSession, ClassroomSessionEvent.session_id == ClassroomSession.id)
        .where(
            *ot_base,
            ClassroomSessionEvent.created_at > ClassroomSession.session_end,
        )
    )
    assignments_late = int(late.scalar_one() or 0)

    ev_students = await session.execute(
        select(ClassroomSessionEvent.actor_id)
        .where(*ev_base, ClassroomSessionEvent.actor_type == "student")
        .distinct()
    )
    active.update(row[0] for row in ev_students.all())

    att_base = [
        Attendance.tenant_id == tenant_id,
        Attendance.created_at >= start,
        Attendance.created_at < end,
    ]
    if student_ids is not None:
        att_base.append(Attendance.student_id.in_(student_ids))

    att_tot = await session.execute(select(func.count()).select_from(Attendance).where(*att_base))
    attendance_total = int(att_tot.scalar_one() or 0)
    att_pres = await session.execute(
        select(func.count())
        .select_from(Attendance)
        .where(*att_base, Attendance.status == "present")
    )
    attendance_present = int(att_pres.scalar_one() or 0)

    att_students = await session.execute(
        select(Attendance.student_id).where(*att_base).distinct()
    )
    active.update(row[0] for row in att_students.all())

    pr_base = [
        ClassroomSessionPresence.tenant_id == tenant_id,
        ClassroomSessionPresence.last_seen_at >= start,
        ClassroomSessionPresence.last_seen_at < end,
    ]
    if student_ids is not None:
        pr_base.append(ClassroomSessionPresence.actor_type == "student")
        pr_base.append(ClassroomSessionPresence.actor_id.in_(student_ids))

    pr_count = await session.execute(
        select(func.count()).select_from(ClassroomSessionPresence).where(*pr_base)
    )
    presence_records = int(pr_count.scalar_one() or 0)

    pr_students = await session.execute(
        select(ClassroomSessionPresence.actor_id)
        .where(*pr_base, ClassroomSessionPresence.actor_type == "student")
        .distinct()
    )
    active.update(row[0] for row in pr_students.all())

    median_lesson, mean_lesson = await _score_stats(
        session,
        select(LessonProgress.score).where(
            *lp_base,
            LessonProgress.completed_at.isnot(None),
            LessonProgress.completed_at >= start,
            LessonProgress.completed_at < end,
            LessonProgress.score.isnot(None),
        ),
    )
    median_lab, mean_lab = await _score_stats(
        session,
        select(LabProgress.score).where(
            *lab_base,
            LabProgress.completed_at.isnot(None),
            LabProgress.completed_at >= start,
            LabProgress.completed_at < end,
            LabProgress.score.isnot(None),
        ),
    )

    g_n, g_med, g_mean, g_rub = await _grading_metrics(session, tenant_id, start, end, student_ids)

    enrolled_for_row = enrolled_tenant_active if student_ids is None else len(student_ids)

    return {
        "enrolled_tenant_active": enrolled_tenant_active,
        "active_students": len(active),
        "lesson_completions": lesson_completions,
        "lab_completions": lab_completions,
        "lesson_progress_updates": lesson_progress_updates,
        "lab_progress_updates": lab_progress_updates,
        "assignments_submitted": assignments_submitted,
        "assignments_saved": assignments_saved,
        "assignments_on_time": assignments_on_time,
        "assignments_late": assignments_late,
        "attendance_present": attendance_present,
        "attendance_total": attendance_total,
        "presence_records": presence_records,
        "median_lesson_score": median_lesson,
        "median_lab_score": median_lab,
        "mean_lesson_score": mean_lesson,
        "mean_lab_score": mean_lab,
        "assignments_graded": g_n,
        "median_assignment_score": g_med,
        "mean_assignment_score": g_mean,
        "mean_rubric_compliance": g_rub,
        "enrolled_students": enrolled_for_row,
    }


def _empty_metrics(enrolled: int) -> dict[str, Any]:
    return {
        "enrolled_tenant_active": enrolled,
        "active_students": 0,
        "lesson_completions": 0,
        "lab_completions": 0,
        "lesson_progress_updates": 0,
        "lab_progress_updates": 0,
        "assignments_submitted": 0,
        "assignments_saved": 0,
        "assignments_on_time": 0,
        "assignments_late": 0,
        "attendance_present": 0,
        "attendance_total": 0,
        "presence_records": 0,
        "median_lesson_score": None,
        "median_lab_score": None,
        "mean_lesson_score": None,
        "mean_lab_score": None,
        "assignments_graded": 0,
        "median_assignment_score": None,
        "mean_assignment_score": None,
        "mean_rubric_compliance": None,
        "enrolled_students": enrolled,
    }


async def _score_stats(session: AsyncSession, score_query) -> tuple[float | None, float | None]:
    r = await session.execute(score_query)
    scores = [int(row[0]) for row in r.all() if row[0] is not None]
    if not scores:
        return None, None
    scores.sort()
    n = len(scores)
    mid = n // 2
    median = float(scores[mid] if n % 2 else (scores[mid - 1] + scores[mid]) / 2)
    mean = float(sum(scores) / n)
    return median, mean


async def list_active_tenant_ids(session: AsyncSession) -> list[UUID]:
    from app.tenants.models import Tenant

    r = await session.execute(select(Tenant.id).where(Tenant.is_active == True))  # noqa: E712
    return [row[0] for row in r.all()]
