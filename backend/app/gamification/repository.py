from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .models import BadgeDefinition, Shoutout, Streak, StudentBadge, WeeklyWinner, XPTransaction


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

    async def update_streak(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> Streak:
        streak = await self.get_or_create_streak(student_id, tenant_id)
        today = datetime.now(timezone.utc).date()
        if streak.last_activity_date is None:
            streak.current_streak = 1
        elif streak.last_activity_date == today:
            pass  # Already active today, no change
        elif (today - streak.last_activity_date).days == 1:
            streak.current_streak += 1
        else:
            streak.current_streak = 1  # Streak broken
        streak.last_activity_date = today
        if streak.current_streak > streak.best_streak:
            streak.best_streak = streak.current_streak
        await self.db.flush()
        return streak

    # ── Badges ────────────────────────────────────────────────────────────────

    async def list_badge_definitions(self, tenant_id: uuid.UUID) -> list[BadgeDefinition]:
        result = await self.db.execute(
            select(BadgeDefinition).where(
                (BadgeDefinition.tenant_id == tenant_id) | (BadgeDefinition.tenant_id.is_(None))
            )
        )
        return list(result.scalars().all())

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
