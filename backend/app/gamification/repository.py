from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import ClassroomSessionEvent, ClassroomSessionPresence
from app.labs.models import Project
from app.progress.models import Attendance, LabProgress, LessonProgress
from app.students.models import StudentMembership

from .models import (
    BadgeDefinition,
    GamificationGoal,
    LabEventStream,
    Shoutout,
    Streak,
    StudentBadge,
    WeeklyWinner,
    XPTransaction,
)


class GamificationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── XP ────────────────────────────────────────────────────────────────────

    async def add_xp(
        self,
        student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        amount: int,
        reason: str,
        source: str = "manual",
        source_id: uuid.UUID | None = None,
    ) -> XPTransaction:
        tx = XPTransaction(
            student_id=student_id,
            tenant_id=tenant_id,
            amount=amount,
            reason=reason,
            source=source,
            source_id=source_id,
        )
        self.db.add(tx)
        await self.db.flush()
        return tx

    async def get_total_xp(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(
                XPTransaction.student_id == student_id,
                XPTransaction.tenant_id == tenant_id,
            )
        )
        return int(result.scalar() or 0)

    async def get_recent_xp(
        self, student_id: uuid.UUID, tenant_id: uuid.UUID, limit: int = 10
    ) -> list[XPTransaction]:
        result = await self.db.execute(
            select(XPTransaction)
            .where(
                XPTransaction.student_id == student_id,
                XPTransaction.tenant_id == tenant_id,
            )
            .order_by(XPTransaction.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ── Streaks ───────────────────────────────────────────────────────────────

    async def student_membership_exists(
        self, student_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        result = await self.db.execute(
            select(StudentMembership.id).where(
                StudentMembership.student_id == student_id,
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none() is not None

    async def get_or_create_streak(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> Streak:
        result = await self.db.execute(
            select(Streak).where(
                Streak.student_id == student_id,
                Streak.tenant_id == tenant_id,
            )
        )
        streak = result.scalar_one_or_none()
        if streak is None:
            streak = Streak(student_id=student_id, tenant_id=tenant_id)
            self.db.add(streak)
            await self.db.flush()
        return streak

    async def get_streak(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> Streak | None:
        result = await self.db.execute(
            select(Streak).where(
                Streak.student_id == student_id,
                Streak.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_streak(
        self,
        student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        *,
        calendar_tz: str = "UTC",
    ) -> Streak | None:
        """Advance streak using *calendar* dates in ``calendar_tz`` (IANA), not UTC alone."""
        if not await self.student_membership_exists(student_id, tenant_id):
            logger.debug(
                "streak_update skipped missing_or_inactive_student_membership student=%s tenant=%s",
                student_id,
                tenant_id,
            )
            return None
        streak = await self.get_or_create_streak(student_id, tenant_id)
        try:
            tz = ZoneInfo((calendar_tz or "UTC").strip() or "UTC")
        except Exception:
            tz = ZoneInfo("UTC")
        utc_now = datetime.now(timezone.utc)
        today_local = utc_now.astimezone(tz).date()
        prev_last = streak.last_activity_date
        prev_current = streak.current_streak
        if streak.last_activity_date is None:
            streak.current_streak = 1
            branch = "first_day"
        elif streak.last_activity_date == today_local:
            branch = "same_day_unchanged"
        elif (today_local - streak.last_activity_date).days == 1:
            streak.current_streak += 1
            branch = "consecutive"
        else:
            streak.current_streak = 1  # Streak broken
            branch = "broken_reset"
        streak.last_activity_date = today_local
        if streak.current_streak > streak.best_streak:
            streak.best_streak = streak.current_streak
        await self.db.flush()
        logger.debug(
            "streak_update student=%s tenant=%s calendar_tz=%r utc_now=%s today_local=%s branch=%s "
            "prev_last=%s prev_current=%s new_current=%s new_best=%s",
            student_id,
            tenant_id,
            calendar_tz,
            utc_now.isoformat(),
            today_local.isoformat(),
            branch,
            prev_last.isoformat() if prev_last else None,
            prev_current,
            streak.current_streak,
            streak.best_streak,
        )
        return streak

    async def get_streak_activity_local_dates(
        self,
        student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        range_start_utc: datetime,
        range_end_utc: datetime,
        tz: ZoneInfo,
    ) -> set[date]:
        """Calendar dates (in ``tz``) with qualifying activity in the UTC window.

        Includes XP, shoutouts, class attendance, live session presence, session
        assignment work, curriculum/lab progress touches, and lab project submissions.
        """
        xp_rows = await self.db.execute(
            select(XPTransaction.created_at).where(
                XPTransaction.student_id == student_id,
                XPTransaction.tenant_id == tenant_id,
                XPTransaction.created_at >= range_start_utc,
                XPTransaction.created_at < range_end_utc,
            )
        )
        shoutout_rows = await self.db.execute(
            select(Shoutout.created_at).where(
                Shoutout.to_student_id == student_id,
                Shoutout.tenant_id == tenant_id,
                Shoutout.created_at >= range_start_utc,
                Shoutout.created_at < range_end_utc,
            )
        )
        attendance_rows = await self.db.execute(
            select(Attendance.created_at).where(
                Attendance.student_id == student_id,
                Attendance.tenant_id == tenant_id,
                Attendance.status.in_(("present", "late")),
                Attendance.created_at >= range_start_utc,
                Attendance.created_at < range_end_utc,
            )
        )
        presence_rows = await self.db.execute(
            select(ClassroomSessionPresence.first_seen_at).where(
                ClassroomSessionPresence.tenant_id == tenant_id,
                ClassroomSessionPresence.actor_id == student_id,
                ClassroomSessionPresence.actor_type == "student",
                ClassroomSessionPresence.first_seen_at >= range_start_utc,
                ClassroomSessionPresence.first_seen_at < range_end_utc,
            )
        )
        submission_types = ("student.submission.saved", "student.submission.submitted")
        submission_rows = await self.db.execute(
            select(ClassroomSessionEvent.created_at).where(
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.event_type.in_(submission_types),
                ClassroomSessionEvent.created_at >= range_start_utc,
                ClassroomSessionEvent.created_at < range_end_utc,
                or_(
                    ClassroomSessionEvent.student_id == student_id,
                    and_(
                        ClassroomSessionEvent.actor_type == "student",
                        ClassroomSessionEvent.actor_id == student_id,
                    ),
                ),
            )
        )
        lesson_touch_rows = await self.db.execute(
            select(LessonProgress.updated_at).where(
                LessonProgress.student_id == student_id,
                LessonProgress.tenant_id == tenant_id,
                LessonProgress.status != "not_started",
                LessonProgress.updated_at >= range_start_utc,
                LessonProgress.updated_at < range_end_utc,
            )
        )
        lesson_done_rows = await self.db.execute(
            select(LessonProgress.completed_at).where(
                LessonProgress.student_id == student_id,
                LessonProgress.tenant_id == tenant_id,
                LessonProgress.completed_at.isnot(None),
                LessonProgress.completed_at >= range_start_utc,
                LessonProgress.completed_at < range_end_utc,
            )
        )
        lab_touch_rows = await self.db.execute(
            select(LabProgress.updated_at).where(
                LabProgress.student_id == student_id,
                LabProgress.tenant_id == tenant_id,
                LabProgress.status != "not_started",
                LabProgress.updated_at >= range_start_utc,
                LabProgress.updated_at < range_end_utc,
            )
        )
        lab_done_rows = await self.db.execute(
            select(LabProgress.completed_at).where(
                LabProgress.student_id == student_id,
                LabProgress.tenant_id == tenant_id,
                LabProgress.completed_at.isnot(None),
                LabProgress.completed_at >= range_start_utc,
                LabProgress.completed_at < range_end_utc,
            )
        )
        project_rows = await self.db.execute(
            select(Project.submitted_at).where(
                Project.student_id == student_id,
                Project.tenant_id == tenant_id,
                Project.submitted_at >= range_start_utc,
                Project.submitted_at < range_end_utc,
            )
        )
        active_dates: set[date] = set()

        def _to_local_day(stamp: datetime) -> date:
            aware = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
            return aware.astimezone(tz).date()

        for stamp in xp_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in shoutout_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in attendance_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in presence_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in submission_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in lesson_touch_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in lesson_done_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in lab_touch_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in lab_done_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        for stamp in project_rows.scalars().all():
            active_dates.add(_to_local_day(stamp))
        return active_dates

    # ── Badges ────────────────────────────────────────────────────────────────

    async def list_badge_definitions(
        self,
        tenant_id: uuid.UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[BadgeDefinition], int]:
        filters = (BadgeDefinition.tenant_id == tenant_id) | (
            BadgeDefinition.tenant_id.is_(None)
        )
        count_stmt = select(func.count()).select_from(BadgeDefinition).where(filters)
        total = int((await self.db.execute(count_stmt)).scalar() or 0)
        result = await self.db.execute(
            select(BadgeDefinition)
            .where(filters)
            .order_by(BadgeDefinition.name)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def get_badge_by_slug(self, slug: str, tenant_id: uuid.UUID) -> BadgeDefinition | None:
        result = await self.db.execute(
            select(BadgeDefinition).where(
                BadgeDefinition.slug == slug,
                (BadgeDefinition.tenant_id == tenant_id) | (BadgeDefinition.tenant_id.is_(None)),
            )
        )
        return result.scalar_one_or_none()

    async def get_student_badges(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> list[StudentBadge]:
        result = await self.db.execute(
            select(StudentBadge)
            .where(
                StudentBadge.student_id == student_id,
                StudentBadge.tenant_id == tenant_id,
            )
            .order_by(StudentBadge.awarded_at.desc())
        )
        return list(result.scalars().all())

    async def has_badge(self, student_id: uuid.UUID, badge_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(StudentBadge).where(
                StudentBadge.student_id == student_id,
                StudentBadge.badge_id == badge_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def award_badge(
        self,
        student_id: uuid.UUID,
        badge_id: uuid.UUID,
        tenant_id: uuid.UUID,
        awarded_by_id: uuid.UUID | None = None,
    ) -> StudentBadge:
        sb = StudentBadge(
            student_id=student_id,
            badge_id=badge_id,
            tenant_id=tenant_id,
            awarded_by_id=awarded_by_id,
        )
        self.db.add(sb)
        await self.db.flush()
        return sb

    async def revoke_badge(
        self,
        student_id: uuid.UUID,
        badge_id: uuid.UUID,
        tenant_id: uuid.UUID,
    ) -> bool:
        """Remove an awarded badge row. Does not adjust XP already granted for the badge."""
        result = await self.db.execute(
            delete(StudentBadge).where(
                StudentBadge.student_id == student_id,
                StudentBadge.badge_id == badge_id,
                StudentBadge.tenant_id == tenant_id,
            )
        )
        return (result.rowcount or 0) > 0

    async def count_student_badges(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(StudentBadge.id)).where(
                StudentBadge.student_id == student_id,
                StudentBadge.tenant_id == tenant_id,
            )
        )
        return int(result.scalar() or 0)

    # ── Shoutouts ─────────────────────────────────────────────────────────────

    async def create_shoutout(
        self,
        from_user_id: uuid.UUID,
        to_student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        message: str,
        emoji: str = "🌟",
        classroom_id: uuid.UUID | None = None,
    ) -> Shoutout:
        s = Shoutout(
            from_user_id=from_user_id,
            to_student_id=to_student_id,
            tenant_id=tenant_id,
            message=message,
            emoji=emoji,
            classroom_id=classroom_id,
        )
        self.db.add(s)
        await self.db.flush()
        return s

    async def list_shoutouts(
        self,
        tenant_id: uuid.UUID,
        student_id: uuid.UUID | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Shoutout], int]:
        q = select(Shoutout).where(Shoutout.tenant_id == tenant_id)
        if student_id:
            q = q.where(Shoutout.to_student_id == student_id)
        count_q = select(func.count()).select_from(q.subquery())
        total = int((await self.db.execute(count_q)).scalar() or 0)
        rows = await self.db.execute(
            q.order_by(Shoutout.created_at.desc()).limit(limit).offset(offset)
        )
        return list(rows.scalars().all()), total

    async def count_shoutouts_received(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(Shoutout.id)).where(
                Shoutout.to_student_id == student_id,
                Shoutout.tenant_id == tenant_id,
            )
        )
        return int(result.scalar() or 0)

    # ── Weekly winners ────────────────────────────────────────────────────────

    async def get_weekly_winners(
        self, tenant_id: uuid.UUID, limit_weeks: int = 8
    ) -> list[WeeklyWinner]:
        result = await self.db.execute(
            select(WeeklyWinner)
            .where(WeeklyWinner.tenant_id == tenant_id)
            .order_by(WeeklyWinner.week_start.desc(), WeeklyWinner.rank.asc())
            .limit(limit_weeks * 3)
        )
        return list(result.scalars().all())

    async def get_current_week_winners(
        self, tenant_id: uuid.UUID, week_start: date
    ) -> list[WeeklyWinner]:
        result = await self.db.execute(
            select(WeeklyWinner)
            .where(
                WeeklyWinner.tenant_id == tenant_id,
                WeeklyWinner.week_start == week_start,
            )
            .order_by(WeeklyWinner.rank.asc())
        )
        return list(result.scalars().all())

    async def create_weekly_winner(
        self,
        tenant_id: uuid.UUID,
        student_id: uuid.UUID,
        student_name: str,
        week_start: date,
        week_end: date,
        xp_earned: int,
        rank: int,
        crowned_by_id: uuid.UUID | None = None,
    ) -> WeeklyWinner:
        w = WeeklyWinner(
            tenant_id=tenant_id,
            student_id=student_id,
            student_name=student_name,
            week_start=week_start,
            week_end=week_end,
            xp_earned=xp_earned,
            rank=rank,
            crowned_by_id=crowned_by_id,
        )
        self.db.add(w)
        await self.db.flush()
        return w

    async def has_winners_this_week(self, tenant_id: uuid.UUID, week_start: date) -> bool:
        result = await self.db.execute(
            select(func.count(WeeklyWinner.id)).where(
                WeeklyWinner.tenant_id == tenant_id,
                WeeklyWinner.week_start == week_start,
            )
        )
        return int(result.scalar() or 0) > 0

    # ── Leaderboard ───────────────────────────────────────────────────────────

    async def get_leaderboard(
        self, tenant_id: uuid.UUID, limit: int = 10
    ) -> list[dict]:
        """Returns rows: student_id, total_xp, badge_count, first_name, last_name."""
        sql = text(
            """
            WITH tenant_students AS (
                SELECT s.id, s.first_name, s.last_name
                FROM students s
                INNER JOIN student_memberships sm
                    ON sm.student_id = s.id
                WHERE sm.tenant_id = :tid
                  AND sm.is_active = TRUE
            )
            SELECT
                ts.id AS student_id,
                ts.first_name,
                ts.last_name,
                COALESCE(SUM(x.amount), 0)::int AS total_xp,
                COUNT(DISTINCT sb.id)::int        AS badge_count
            FROM tenant_students ts
            LEFT JOIN xp_transactions x
                ON x.student_id = ts.id AND x.tenant_id = :tid
            LEFT JOIN student_badges sb
                ON sb.student_id = ts.id AND sb.tenant_id = :tid
            GROUP BY ts.id, ts.first_name, ts.last_name
            ORDER BY total_xp DESC
            LIMIT :lim
            """
        )
        result = await self.db.execute(sql, {"tid": tenant_id, "lim": limit})
        return [dict(row._mapping) for row in result]

    async def get_student_xp_rank(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> int | None:
        sql = text(
            """
            WITH tenant_students AS (
                SELECT s.id
                FROM students s
                INNER JOIN student_memberships sm
                    ON sm.student_id = s.id
                WHERE sm.tenant_id = :tid
                  AND sm.is_active = TRUE
            )
            SELECT rank FROM (
                SELECT ts.id, RANK() OVER (ORDER BY COALESCE(SUM(x.amount),0) DESC) AS rank
                FROM tenant_students ts
                LEFT JOIN xp_transactions x ON x.student_id = ts.id AND x.tenant_id = :tid
                GROUP BY ts.id
            ) ranked
            WHERE id = :sid
            """
        )
        result = await self.db.execute(sql, {"tid": tenant_id, "sid": student_id})
        row = result.one_or_none()
        return int(row.rank) if row else None

    # ── Tenant goals + event stream ───────────────────────────────────────────

    async def create_goal(
        self,
        tenant_id: uuid.UUID,
        created_by_id: uuid.UUID | None,
        lab_type: str,
        name: str,
        description: str,
        is_active: bool,
        event_map: dict,
        conditions: list,
        reward: dict,
    ) -> GamificationGoal:
        goal = GamificationGoal(
            tenant_id=tenant_id,
            created_by_id=created_by_id,
            updated_by_id=created_by_id,
            lab_type=lab_type,
            name=name,
            description=description,
            is_active=is_active,
            event_map=event_map,
            conditions=conditions,
            reward=reward,
        )
        self.db.add(goal)
        await self.db.flush()
        return goal

    async def list_goals(
        self,
        tenant_id: uuid.UUID,
        lab_type: str | None = None,
        is_active: bool | None = None,
    ) -> list[GamificationGoal]:
        q = select(GamificationGoal).where(GamificationGoal.tenant_id == tenant_id)
        if lab_type:
            q = q.where(GamificationGoal.lab_type == lab_type)
        if is_active is not None:
            q = q.where(GamificationGoal.is_active == is_active)
        q = q.order_by(GamificationGoal.created_at.desc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get_goal(self, tenant_id: uuid.UUID, goal_id: uuid.UUID) -> GamificationGoal | None:
        result = await self.db.execute(
            select(GamificationGoal).where(
                GamificationGoal.tenant_id == tenant_id,
                GamificationGoal.id == goal_id,
            )
        )
        return result.scalar_one_or_none()

    async def delete_goal(self, tenant_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
        goal = await self.get_goal(tenant_id, goal_id)
        if goal is None:
            return False
        await self.db.delete(goal)
        await self.db.flush()
        return True

    async def create_lab_event(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        lab_id: str,
        lab_type: str,
        event_type: str,
        context: dict,
        occurred_at: datetime,
        goal_matches: list,
        points_awarded: int,
    ) -> LabEventStream:
        row = LabEventStream(
            tenant_id=tenant_id,
            user_id=user_id,
            lab_id=lab_id,
            lab_type=lab_type,
            event_type=event_type,
            context=context,
            occurred_at=occurred_at,
            goal_matches=goal_matches,
            points_awarded=points_awarded,
        )
        self.db.add(row)
        await self.db.flush()
        return row
