"""Aggregated learning activity for guardian dashboards (read-only)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom, ClassroomSession, ClassroomSessionEvent
from app.curriculum.models import Lab, Lesson
from app.gamification.models import BadgeDefinition, StudentBadge, XPTransaction
from app.progress.models import Attendance, LabProgress, LessonProgress
from app.students.schemas import (
    ParentActivityItem,
    ParentChildActivityResponse,
    ParentWeeklyDigest,
)

_DIGEST_DAYS = 7
# Per-source fetch caps before merge (keeps DB + memory bounded).
_SOURCE_LIMIT_LESSON = 60
_SOURCE_LIMIT_LAB = 60
_SOURCE_LIMIT_BADGE = 40
_SOURCE_LIMIT_XP = 40
_SOURCE_LIMIT_SUB = 40
_SOURCE_LIMIT_ATT = 40
_DEFAULT_ACTIVITY_LIMIT = 40
_MAX_ACTIVITY_LIMIT = 100


def _lesson_occurred_at(lp: LessonProgress) -> datetime:
    return lp.completed_at or lp.updated_at


def _lab_occurred_at(lp: LabProgress) -> datetime:
    return lp.completed_at or lp.updated_at


async def load_parent_child_activity(
    db: AsyncSession,
    *,
    student_id: UUID,
    tenant_id: UUID,
    skip: int = 0,
    limit: int = _DEFAULT_ACTIVITY_LIMIT,
) -> ParentChildActivityResponse:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=_DIGEST_DAYS)

    lp_time = func.coalesce(LessonProgress.completed_at, LessonProgress.updated_at)
    lab_time = func.coalesce(LabProgress.completed_at, LabProgress.updated_at)

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

    merged: list[tuple[datetime, ParentActivityItem]] = []

    lesson_rows = await db.execute(
        select(LessonProgress, Lesson)
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .where(
            LessonProgress.student_id == student_id,
            LessonProgress.tenant_id == tenant_id,
            LessonProgress.status == "completed",
        )
        .order_by(lp_time.desc())
        .limit(_SOURCE_LIMIT_LESSON)
    )
    for lp, lesson in lesson_rows.all():
        at = _lesson_occurred_at(lp)
        merged.append(
            (
                at,
                ParentActivityItem(
                    kind="lesson_completed",
                    occurred_at=at,
                    title="Lesson completed",
                    detail=lesson.title,
                    ref_id=str(lesson.id),
                ),
            )
        )

    lab_rows = await db.execute(
        select(LabProgress, Lab)
        .join(Lab, Lab.id == LabProgress.lab_id)
        .where(
            LabProgress.student_id == student_id,
            LabProgress.tenant_id == tenant_id,
            LabProgress.status == "completed",
        )
        .order_by(lab_time.desc())
        .limit(18)
    )
    for lp, lab in lab_rows.all():
        at = _lab_occurred_at(lp)
        merged.append(
            (
                at,
                ParentActivityItem(
                    kind="lab_completed",
                    occurred_at=at,
                    title="Lab completed",
                    detail=lab.title,
                    ref_id=str(lab.id),
                    classroom_id=None,
                    class_name=None,
                ),
            )
        )

    badge_rows = await db.execute(
        select(StudentBadge, BadgeDefinition)
        .join(BadgeDefinition, BadgeDefinition.id == StudentBadge.badge_id)
        .where(
            StudentBadge.student_id == student_id,
            StudentBadge.tenant_id == tenant_id,
        )
        .order_by(StudentBadge.awarded_at.desc())
        .limit(_SOURCE_LIMIT_BADGE)
    )
    for sb, bd in badge_rows.all():
        merged.append(
            (
                sb.awarded_at,
                ParentActivityItem(
                    kind="sticker_earned",
                    occurred_at=sb.awarded_at,
                    title="Badge earned",
                    detail=bd.name,
                    ref_id=str(sb.id),
                ),
            )
        )

    xp_rows = await db.execute(
        select(XPTransaction)
        .where(
            XPTransaction.student_id == student_id,
            XPTransaction.tenant_id == tenant_id,
            XPTransaction.amount > 0,
        )
        .order_by(XPTransaction.created_at.desc())
        .limit(_SOURCE_LIMIT_XP)
    )
    for tx in xp_rows.scalars().all():
        merged.append(
            (
                tx.created_at,
                ParentActivityItem(
                    kind="xp_earned",
                    occurred_at=tx.created_at,
                    title=f"+{tx.amount} XP",
                    detail=tx.reason,
                    ref_id=str(tx.id),
                ),
            )
        )

    sub_rows = await db.execute(
        select(ClassroomSessionEvent, ClassroomSession, Classroom)
        .join(
            ClassroomSession,
            ClassroomSession.id == ClassroomSessionEvent.session_id,
        )
        .join(Classroom, Classroom.id == ClassroomSessionEvent.classroom_id)
        .where(
            ClassroomSessionEvent.tenant_id == tenant_id,
            ClassroomSessionEvent.actor_id == student_id,
            ClassroomSessionEvent.event_type == "student.submission.submitted",
        )
        .order_by(ClassroomSessionEvent.created_at.desc())
        .limit(_SOURCE_LIMIT_SUB)
    )
    for ev, sess, room in sub_rows.all():
        merged.append(
            (
                ev.created_at,
                ParentActivityItem(
                    kind="assignment_submitted",
                    occurred_at=ev.created_at,
                    title="Assignment submitted",
                    detail=room.name,
                    ref_id=str(ev.id),
                    classroom_id=str(room.id),
                    class_name=room.name,
                ),
            )
        )

    att_rows = await db.execute(
        select(Attendance, Classroom, ClassroomSession)
        .join(Classroom, Classroom.id == Attendance.classroom_id)
        .join(ClassroomSession, ClassroomSession.id == Attendance.session_id)
        .where(
            Attendance.student_id == student_id,
            Attendance.tenant_id == tenant_id,
        )
        .order_by(Attendance.created_at.desc())
        .limit(_SOURCE_LIMIT_ATT)
    )
    for att, classroom, sess in att_rows.all():
        status_label = att.status.replace("_", " ").title()
        merged.append(
            (
                att.created_at,
                ParentActivityItem(
                    kind="attendance",
                    occurred_at=att.created_at,
                    title="Class session",
                    detail=f"{classroom.name} · {status_label}",
                    ref_id=str(att.id),
                    classroom_id=str(classroom.id),
                    class_name=classroom.name,
                ),
            )
        )

    merged.sort(key=lambda x: x[0], reverse=True)
    total = len(merged)
    slice_pairs = merged[skip : skip + limit]
    items = [it for _, it in slice_pairs]

    return ParentChildActivityResponse(
        items=items,
        weekly_digest=digest,
        total=total,
        skip=skip,
        limit=limit,
    )
