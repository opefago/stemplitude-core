"""Aggregated learning activity for guardian dashboards (read-only)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import String, cast, func, literal, null, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import (
    Classroom,
    ClassroomSession,
    ClassroomSessionEvent,
    ClassroomStudent,
)
from app.curriculum.models import Lab, Lesson
from app.gamification.models import BadgeDefinition, StudentBadge, XPTransaction
from app.progress.models import Attendance, LabProgress, LessonProgress
from app.students.schemas import (
    ParentActivityItem,
    ParentAssignmentGradeRow,
    ParentChildActivityResponse,
    ParentChildAssignmentGradesResponse,
    ParentEnrolledClassroomRef,
    ParentWeeklyDigest,
)

_DIGEST_DAYS = 7
_DEFAULT_ACTIVITY_LIMIT = 40
_MAX_ACTIVITY_LIMIT = 100
_DEFAULT_RANGE_DAYS = 90
_MAX_RANGE_DAYS = 366
_MAX_GRADE_LIMIT = 100
_DEFAULT_GRADE_LIMIT = 50

_STR = String(500)
_STR_LONG = String(4000)


def _lesson_occurred_at(lp: LessonProgress) -> datetime:
    return lp.completed_at or lp.updated_at


def _lab_occurred_at(lp: LabProgress) -> datetime:
    return lp.completed_at or lp.updated_at


def _na_str():
    return cast(null(), _STR)


async def load_parent_child_activity(
    db: AsyncSession,
    *,
    student_id: UUID,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = _DEFAULT_ACTIVITY_LIMIT,
    occurred_after: datetime | None = None,
    occurred_before: datetime | None = None,
    activity_kind: str | None = None,
    without_classroom: bool = False,
    classroom_id: UUID | None = None,
) -> ParentChildActivityResponse:
    """Paginated activity in [occurred_after, occurred_before], with optional kind / class filters."""
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=_DIGEST_DAYS)

    if occurred_before is None:
        occurred_before = now
    if occurred_after is None:
        occurred_after = occurred_before - timedelta(days=_DEFAULT_RANGE_DAYS)
    if occurred_after > occurred_before:
        raise ValueError("occurred_after must be before or equal to occurred_before")
    max_span = timedelta(days=_MAX_RANGE_DAYS)
    if occurred_before - occurred_after > max_span:
        occurred_after = occurred_before - max_span

    lim = max(1, min(limit, _MAX_ACTIVITY_LIMIT))
    sk = max(0, skip)

    lp_time = func.coalesce(LessonProgress.completed_at, LessonProgress.updated_at)
    lab_time = func.coalesce(LabProgress.completed_at, LabProgress.updated_at)

    enrolled_rows = (
        await db.execute(
            select(Classroom.id, Classroom.name)
            .join(ClassroomStudent, ClassroomStudent.classroom_id == Classroom.id)
            .where(
                ClassroomStudent.student_id == student_id,
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
            )
            .order_by(Classroom.name.asc())
        )
    ).all()
    enrolled_classrooms = [
        ParentEnrolledClassroomRef(id=str(r.id), name=r.name) for r in enrolled_rows
    ]

    lessons_done = int(
        await db.scalar(
            select(func.count(LessonProgress.id)).where(
                LessonProgress.student_id == student_id,
                LessonProgress.tenant_id == tenant_id,
                LessonProgress.status == "completed",
                lp_time >= week_start,
            )
        )
        or 0
    )
    labs_done = int(
        await db.scalar(
            select(func.count(LabProgress.id)).where(
                LabProgress.student_id == student_id,
                LabProgress.tenant_id == tenant_id,
                LabProgress.status == "completed",
                lab_time >= week_start,
            )
        )
        or 0
    )
    badges_n = int(
        await db.scalar(
            select(func.count(StudentBadge.id)).where(
                StudentBadge.student_id == student_id,
                StudentBadge.tenant_id == tenant_id,
                StudentBadge.awarded_at >= week_start,
            )
        )
        or 0
    )
    xp_sum = int(
        await db.scalar(
            select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(
                XPTransaction.student_id == student_id,
                XPTransaction.tenant_id == tenant_id,
                XPTransaction.created_at >= week_start,
                XPTransaction.amount > 0,
            )
        )
        or 0
    )
    attended = int(
        await db.scalar(
            select(func.count(Attendance.id)).where(
                Attendance.student_id == student_id,
                Attendance.tenant_id == tenant_id,
                Attendance.created_at >= week_start,
                or_(
                    Attendance.status == "present",
                    Attendance.status == "late",
                ),
            )
        )
        or 0
    )
    assignments_n = int(
        await db.scalar(
            select(func.count(ClassroomSessionEvent.id)).where(
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.actor_id == student_id,
                ClassroomSessionEvent.event_type == "student.submission.submitted",
                ClassroomSessionEvent.created_at >= week_start,
            )
        )
        or 0
    )

    digest = ParentWeeklyDigest(
        period_start=week_start,
        period_end=now,
        lessons_completed=lessons_done,
        labs_completed=labs_done,
        badges_earned=badges_n,
        xp_earned=xp_sum,
        sessions_attended=attended,
        assignments_submitted=assignments_n,
    )

    def want(k: str) -> bool:
        return activity_kind is None or activity_kind == k

    include_classless = classroom_id is None and not without_classroom
    include_general_only = without_classroom
    include_specific_class = classroom_id is not None

    selects: list = []

    if want("lesson_completed") and (include_classless or include_general_only):
        lesson_sel = (
            select(
                lp_time.label("occurred_at"),
                cast(literal("lesson_completed"), _STR).label("kind"),
                cast(literal("Lesson completed"), _STR).label("title"),
                cast(Lesson.title, _STR_LONG).label("detail"),
                cast(Lesson.id, _STR).label("ref_id"),
                _na_str().label("classroom_id"),
                _na_str().label("class_name"),
            )
            .select_from(LessonProgress)
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .where(
                LessonProgress.student_id == student_id,
                LessonProgress.tenant_id == tenant_id,
                LessonProgress.status == "completed",
                lp_time >= occurred_after,
                lp_time <= occurred_before,
            )
        )
        selects.append(lesson_sel)

    if want("lab_completed") and (include_classless or include_general_only):
        lab_sel = (
            select(
                lab_time.label("occurred_at"),
                cast(literal("lab_completed"), _STR).label("kind"),
                cast(literal("Lab completed"), _STR).label("title"),
                cast(Lab.title, _STR_LONG).label("detail"),
                cast(Lab.id, _STR).label("ref_id"),
                _na_str().label("classroom_id"),
                _na_str().label("class_name"),
            )
            .select_from(LabProgress)
            .join(Lab, Lab.id == LabProgress.lab_id)
            .where(
                LabProgress.student_id == student_id,
                LabProgress.tenant_id == tenant_id,
                LabProgress.status == "completed",
                lab_time >= occurred_after,
                lab_time <= occurred_before,
            )
        )
        selects.append(lab_sel)

    if want("sticker_earned") and (include_classless or include_general_only):
        badge_sel = (
            select(
                StudentBadge.awarded_at.label("occurred_at"),
                cast(literal("sticker_earned"), _STR).label("kind"),
                cast(literal("Badge earned"), _STR).label("title"),
                cast(BadgeDefinition.name, _STR_LONG).label("detail"),
                cast(StudentBadge.id, _STR).label("ref_id"),
                _na_str().label("classroom_id"),
                _na_str().label("class_name"),
            )
            .select_from(StudentBadge)
            .join(BadgeDefinition, BadgeDefinition.id == StudentBadge.badge_id)
            .where(
                StudentBadge.student_id == student_id,
                StudentBadge.tenant_id == tenant_id,
                StudentBadge.awarded_at >= occurred_after,
                StudentBadge.awarded_at <= occurred_before,
            )
        )
        selects.append(badge_sel)

    if want("xp_earned") and (include_classless or include_general_only):
        xp_title = func.concat(
            cast(literal("+"), _STR),
            cast(XPTransaction.amount, _STR),
            cast(literal(" XP"), _STR),
        )
        xp_sel = (
            select(
                XPTransaction.created_at.label("occurred_at"),
                cast(literal("xp_earned"), _STR).label("kind"),
                cast(xp_title, _STR_LONG).label("title"),
                cast(XPTransaction.reason, _STR_LONG).label("detail"),
                cast(XPTransaction.id, _STR).label("ref_id"),
                _na_str().label("classroom_id"),
                _na_str().label("class_name"),
            )
            .where(
                XPTransaction.student_id == student_id,
                XPTransaction.tenant_id == tenant_id,
                XPTransaction.amount > 0,
                XPTransaction.created_at >= occurred_after,
                XPTransaction.created_at <= occurred_before,
            )
        )
        selects.append(xp_sel)

    if want("assignment_submitted") and not without_classroom:
        sub_where = [
            ClassroomSessionEvent.tenant_id == tenant_id,
            ClassroomSessionEvent.actor_id == student_id,
            ClassroomSessionEvent.event_type == "student.submission.submitted",
            ClassroomSessionEvent.created_at >= occurred_after,
            ClassroomSessionEvent.created_at <= occurred_before,
        ]
        if include_specific_class:
            sub_where.append(Classroom.id == classroom_id)
        sub_sel = (
            select(
                ClassroomSessionEvent.created_at.label("occurred_at"),
                cast(literal("assignment_submitted"), _STR).label("kind"),
                cast(literal("Assignment submitted"), _STR).label("title"),
                cast(Classroom.name, _STR_LONG).label("detail"),
                cast(ClassroomSessionEvent.id, _STR).label("ref_id"),
                cast(Classroom.id, _STR).label("classroom_id"),
                cast(Classroom.name, _STR).label("class_name"),
            )
            .select_from(ClassroomSessionEvent)
            .join(ClassroomSession, ClassroomSession.id == ClassroomSessionEvent.session_id)
            .join(Classroom, Classroom.id == ClassroomSessionEvent.classroom_id)
            .where(*sub_where)
        )
        selects.append(sub_sel)

    if want("attendance") and not without_classroom:
        att_where = [
            Attendance.student_id == student_id,
            Attendance.tenant_id == tenant_id,
            Attendance.created_at >= occurred_after,
            Attendance.created_at <= occurred_before,
        ]
        if include_specific_class:
            att_where.append(Classroom.id == classroom_id)
        att_where.append(
            Attendance.status.in_(("present", "late", "absent", "excused"))
        )
        status_detail = func.concat(
            cast(Classroom.name, _STR_LONG),
            cast(literal(" · "), _STR_LONG),
            func.initcap(func.replace(Attendance.status, "_", " ")),
        )
        att_sel = (
            select(
                Attendance.created_at.label("occurred_at"),
                cast(literal("attendance"), _STR).label("kind"),
                cast(literal("Class session"), _STR).label("title"),
                cast(status_detail, _STR_LONG).label("detail"),
                cast(Attendance.id, _STR).label("ref_id"),
                cast(Classroom.id, _STR).label("classroom_id"),
                cast(Classroom.name, _STR).label("class_name"),
            )
            .select_from(Attendance)
            .join(Classroom, Classroom.id == Attendance.classroom_id)
            .join(ClassroomSession, ClassroomSession.id == Attendance.session_id)
            .where(*att_where)
        )
        selects.append(att_sel)

    if not selects:
        return ParentChildActivityResponse(
            items=[],
            weekly_digest=digest,
            enrolled_classrooms=enrolled_classrooms,
            total=0,
            skip=sk,
            limit=lim,
        )

    unioned = union_all(*selects).subquery("activity_union")
    total = int(
        await db.scalar(select(func.count()).select_from(unioned)) or 0
    )

    rows = (
        await db.execute(
            select(unioned)
            .order_by(unioned.c.occurred_at.desc())
            .offset(sk)
            .limit(lim)
        )
    ).all()

    items: list[ParentActivityItem] = []
    for row in rows:
        occurred_at = row.occurred_at
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        items.append(
            ParentActivityItem(
                kind=row.kind,
                occurred_at=occurred_at,
                title=row.title,
                detail=row.detail,
                ref_id=row.ref_id,
                classroom_id=row.classroom_id,
                class_name=row.class_name,
            )
        )

    return ParentChildActivityResponse(
        items=items,
        weekly_digest=digest,
        enrolled_classrooms=enrolled_classrooms,
        total=total,
        skip=sk,
        limit=lim,
    )


async def load_parent_child_assignment_grades(
    db: AsyncSession,
    *,
    student_id: UUID,
    tenant_id: UUID,
    graded_after: datetime | None = None,
    graded_before: datetime | None = None,
    classroom_id: UUID | None = None,
    skip: int = 0,
    limit: int = _DEFAULT_GRADE_LIMIT,
) -> ParentChildAssignmentGradesResponse:
    """Graded assignment scores for a learner, limited to classes they are enrolled in."""
    now = datetime.now(timezone.utc)
    if graded_before is None:
        graded_before = now
    if graded_after is None:
        graded_after = graded_before - timedelta(days=366)
    if graded_after > graded_before:
        raise ValueError("graded_after must be before or equal to graded_before")

    lim = max(1, min(limit, _MAX_GRADE_LIMIT))
    sk = max(0, skip)

    where_extra = []
    if classroom_id is not None:
        where_extra.append(ClassroomSessionEvent.classroom_id == classroom_id)

    count_q = (
        select(func.count(ClassroomSessionEvent.id))
        .join(Classroom, Classroom.id == ClassroomSessionEvent.classroom_id)
        .join(
            ClassroomStudent,
            and_(
                ClassroomStudent.classroom_id == Classroom.id,
                ClassroomStudent.student_id == student_id,
            ),
        )
        .where(
            ClassroomSessionEvent.tenant_id == tenant_id,
            ClassroomSessionEvent.event_type == "instructor.submission.graded",
            ClassroomSessionEvent.student_id == student_id,
            ClassroomSessionEvent.created_at >= graded_after,
            ClassroomSessionEvent.created_at <= graded_before,
            Classroom.deleted_at.is_(None),
            *where_extra,
        )
    )
    total = int(await db.scalar(count_q) or 0)

    list_q = (
        select(
            ClassroomSessionEvent,
            Classroom.name,
            ClassroomSession.session_start,
            ClassroomSession.session_end,
        )
        .join(Classroom, Classroom.id == ClassroomSessionEvent.classroom_id)
        .join(
            ClassroomStudent,
            and_(
                ClassroomStudent.classroom_id == Classroom.id,
                ClassroomStudent.student_id == student_id,
            ),
        )
        .join(ClassroomSession, ClassroomSession.id == ClassroomSessionEvent.session_id)
        .where(
            ClassroomSessionEvent.tenant_id == tenant_id,
            ClassroomSessionEvent.event_type == "instructor.submission.graded",
            ClassroomSessionEvent.student_id == student_id,
            ClassroomSessionEvent.created_at >= graded_after,
            ClassroomSessionEvent.created_at <= graded_before,
            Classroom.deleted_at.is_(None),
            *where_extra,
        )
        .order_by(ClassroomSessionEvent.created_at.desc())
        .offset(sk)
        .limit(lim)
    )
    rows = (await db.execute(list_q)).all()

    grades: list[ParentAssignmentGradeRow] = []
    for ev, classroom_name, session_start, session_end in rows:
        if session_start is None:
            session_start = ev.created_at
        if session_end is None:
            session_end = session_start
        meta_raw = ev.metadata_
        meta = meta_raw if isinstance(meta_raw, dict) else {}
        sc = meta.get("score")
        try:
            score = int(sc) if sc is not None else 0
        except (TypeError, ValueError):
            score = 0
        score = max(0, min(100, score))
        feedback = meta.get("feedback")
        fb_str = feedback.strip()[:1000] if isinstance(feedback, str) and feedback.strip() else None
        aid = meta.get("assignment_id")
        aid_str = str(aid).strip() if aid is not None and str(aid).strip() else None
        rub_raw = meta.get("rubric")
        rub_out: list[dict] | None = None
        if isinstance(rub_raw, list) and rub_raw:
            rub_out = [dict(c) for c in rub_raw if isinstance(c, dict)]
            if not rub_out:
                rub_out = None
        cname = classroom_name if isinstance(classroom_name, str) else str(classroom_name or "")
        grades.append(
            ParentAssignmentGradeRow(
                graded_at=ev.created_at,
                score=score,
                feedback=fb_str,
                assignment_id=aid_str,
                classroom_id=ev.classroom_id,
                classroom_name=cname.strip() or "Class",
                session_id=ev.session_id,
                session_start=session_start,
                session_end=session_end,
                session_display_title=None,
                rubric=rub_out,
            )
        )

    return ParentChildAssignmentGradesResponse(
        grades=grades, total=total, skip=sk, limit=lim
    )
