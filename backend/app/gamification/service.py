from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.dependencies import TenantContext

from .repository import GamificationRepository
from .schemas import (
    CrownWinnersRequest,
    GamificationProfile,
    GamificationStats,
    HallOfFameResponse,
    HallOfFameWeek,
    LeaderboardEntry,
    LeaderboardResponse,
    ShoutoutOut,
    ShoutoutListResponse,
    StreakOut,
    StudentBadgeOut,
    BadgeDefinitionOut,
    WeeklyWinnerOut,
    XPTransactionOut,
    calculate_level,
)


class GamificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = GamificationRepository(db)
        self.db = db

    async def get_profile(
        self, student_id: uuid.UUID, tenant: TenantContext
    ) -> GamificationProfile:
        tid = tenant.tenant_id
        total_xp = await self.repo.get_total_xp(student_id, tid)
        level, level_name, xp_start, xp_end = calculate_level(total_xp)
        streak = await self.repo.get_streak(student_id, tid)
        if streak is None:
            streak = StreakOut(current_streak=0, best_streak=0)
        raw_badges = await self.repo.get_student_badges(student_id, tid)

        # Load badge definitions eagerly (N+1 guard: list is small)
        badges_out: list[StudentBadgeOut] = []
        for sb in raw_badges:
            defn_result = await self.db.get(
                __import__("app.gamification.models", fromlist=["BadgeDefinition"]).BadgeDefinition,
                sb.badge_id,
            )
            if defn_result:
                badges_out.append(
                    StudentBadgeOut(
                        id=sb.id,
                        badge=BadgeDefinitionOut.model_validate(defn_result),
                        awarded_at=sb.awarded_at,
                        awarded_by_id=sb.awarded_by_id,
                    )
                )

        recent_xp = await self.repo.get_recent_xp(student_id, tid, limit=10)
        shoutout_count = await self.repo.count_shoutouts_received(student_id, tid)

        return GamificationProfile(
            student_id=student_id,
            total_xp=total_xp,
            level=level,
            level_name=level_name,
            xp_start=xp_start,
            xp_end=xp_end,
            streak=StreakOut.model_validate(streak),
            badges=badges_out,
            recent_xp=[XPTransactionOut.model_validate(x) for x in recent_xp],
            stats=GamificationStats(
                total_badges=len(badges_out),
                total_shoutouts_received=shoutout_count,
            ),
        )

    async def award_xp(
        self,
        student_id: uuid.UUID,
        tenant: TenantContext,
        amount: int,
        reason: str,
        source: str = "manual",
        source_id: uuid.UUID | None = None,
    ) -> None:
        await self.repo.add_xp(student_id, tenant.tenant_id, amount, reason, source, source_id)
        await self.repo.update_streak(student_id, tenant.tenant_id)
        await self.db.commit()

    async def award_badge(
        self,
        student_id: uuid.UUID,
        badge_slug: str,
        tenant: TenantContext,
        awarded_by_id: uuid.UUID | None = None,
    ) -> StudentBadgeOut | None:
        defn = await self.repo.get_badge_by_slug(badge_slug, tenant.tenant_id)
        if not defn:
            return None
        if await self.repo.has_badge(student_id, defn.id):
            return None  # Already earned
        sb = await self.repo.award_badge(student_id, defn.id, tenant.tenant_id, awarded_by_id)
        # Grant XP reward if any
        if defn.xp_reward > 0:
            await self.repo.add_xp(
                student_id, tenant.tenant_id, defn.xp_reward,
                f"Badge earned: {defn.name}", "badge", defn.id
            )
        await self.db.commit()
        from app.notifications.dispatch import enqueue_student_in_app_only

        enqueue_student_in_app_only(
            tenant_id=tenant.tenant_id,
            student_id=student_id,
            notification_type="badge_earned",
            title=f"New badge: {defn.name}",
            body=defn.description,
        )
        return StudentBadgeOut(
            id=sb.id,
            badge=BadgeDefinitionOut.model_validate(defn),
            awarded_at=sb.awarded_at,
            awarded_by_id=sb.awarded_by_id,
        )

    async def get_leaderboard(
        self, tenant: TenantContext, limit: int = 10, current_student_id: uuid.UUID | None = None
    ) -> LeaderboardResponse:
        rows = await self.repo.get_leaderboard(tenant.tenant_id, limit)
        entries = []
        for i, row in enumerate(rows):
            level, level_name, _, _ = calculate_level(row["total_xp"])
            entries.append(
                LeaderboardEntry(
                    rank=i + 1,
                    student_id=row["student_id"],
                    student_name=f"{row['first_name']} {row['last_name']}".strip(),
                    total_xp=row["total_xp"],
                    level=level,
                    level_name=level_name,
                    badge_count=row["badge_count"],
                )
            )
        my_rank = None
        my_xp = None
        if current_student_id:
            my_rank = await self.repo.get_student_xp_rank(current_student_id, tenant.tenant_id)
            my_xp = await self.repo.get_total_xp(current_student_id, tenant.tenant_id)
        return LeaderboardResponse(entries=entries, my_rank=my_rank, my_xp=my_xp)

    async def create_shoutout(
        self,
        from_user_id: uuid.UUID,
        from_user_name: str,
        to_student_id: uuid.UUID,
        to_student_name: str,
        tenant: TenantContext,
        message: str,
        emoji: str = "🌟",
        classroom_id: uuid.UUID | None = None,
    ) -> ShoutoutOut:
        s = await self.repo.create_shoutout(
            from_user_id, to_student_id, tenant.tenant_id, message, emoji, classroom_id
        )
        # Award a small XP bonus for receiving a shoutout
        await self.repo.add_xp(
            to_student_id,
            tenant.tenant_id,
            10,
            f"Shoutout from {from_user_name}",
            "shoutout",
            s.id,
        )
        await self.db.commit()
        from app.notifications.dispatch import enqueue_student_in_app_only

        enqueue_student_in_app_only(
            tenant_id=tenant.tenant_id,
            student_id=to_student_id,
            notification_type="shoutout",
            title=f"Shoutout from {from_user_name}",
            body=f"{emoji} {message}".strip(),
        )
        return ShoutoutOut(
            id=s.id,
            from_user_id=from_user_id,
            from_user_name=from_user_name,
            to_student_id=to_student_id,
            to_student_name=to_student_name,
            message=message,
            emoji=emoji,
            classroom_id=classroom_id,
            created_at=s.created_at,
        )

    # ── Weekly winners ────────────────────────────────────────────────────────

    def _week_bounds(self) -> tuple:
        today = datetime.now(timezone.utc).date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        return week_start, week_end

    def _winner_out(self, w) -> WeeklyWinnerOut:
        return WeeklyWinnerOut(
            id=w.id,
            student_id=w.student_id,
            student_name=w.student_name,
            week_start=w.week_start.isoformat(),
            week_end=w.week_end.isoformat(),
            xp_earned=w.xp_earned,
            rank=w.rank,
            crowned_at=w.crowned_at,
        )

    async def crown_weekly_winners(
        self,
        tenant: TenantContext,
        crowned_by_id: uuid.UUID,
        top_n: int = 3,
    ) -> list[WeeklyWinnerOut]:
        week_start, week_end = self._week_bounds()

        if await self.repo.has_winners_this_week(tenant.tenant_id, week_start):
            existing = await self.repo.get_current_week_winners(tenant.tenant_id, week_start)
            return [self._winner_out(w) for w in existing]

        rows = await self.repo.get_leaderboard(tenant.tenant_id, top_n)
        xp_bonuses = {1: 200, 2: 100, 3: 50}
        rank_labels = {
            1: "Weekly Champion 🥇",
            2: "Weekly Runner-up 🥈",
            3: "Weekly Top 3 🥉",
        }

        from app.notifications.models import Notification

        winners: list[WeeklyWinnerOut] = []
        for i, row in enumerate(rows[:top_n]):
            rank = i + 1
            student_id = row["student_id"]
            student_name = f"{row['first_name']} {row['last_name']}".strip()
            w = await self.repo.create_weekly_winner(
                tenant_id=tenant.tenant_id,
                student_id=student_id,
                student_name=student_name,
                week_start=week_start,
                week_end=week_end,
                xp_earned=row["total_xp"],
                rank=rank,
                crowned_by_id=crowned_by_id,
            )
            bonus = xp_bonuses.get(rank, 25)
            label = rank_labels.get(rank, f"Top {rank}")
            await self.repo.add_xp(
                student_id, tenant.tenant_id, bonus, label, "weekly_winner", w.id
            )
            self.db.add(
                Notification(
                    user_id=None,
                    student_id=student_id,
                    tenant_id=tenant.tenant_id,
                    type="weekly_winner",
                    title=f"🎉 {label}",
                    body=(
                        f"You finished #{rank} on the leaderboard this week with "
                        f"{row['total_xp']:,} XP! You earned a {bonus} XP bonus!"
                    ),
                    is_read=False,
                )
            )
            winners.append(self._winner_out(w))

        await self.db.commit()
        from app.realtime.user_events import publish_notifications_changed

        for w in winners:
            try:
                await publish_notifications_changed(tenant.tenant_id, w.student_id)
            except Exception:
                logger.exception(
                    "Failed to publish notifications.changed for weekly winner student=%s",
                    w.student_id,
                )
        return winners

    async def get_current_week_winners(
        self, tenant: TenantContext
    ) -> list[WeeklyWinnerOut]:
        week_start, _ = self._week_bounds()
        raw = await self.repo.get_current_week_winners(tenant.tenant_id, week_start)
        return [self._winner_out(w) for w in raw]

    async def get_hall_of_fame(
        self, tenant: TenantContext, limit_weeks: int = 8
    ) -> HallOfFameResponse:
        raw = await self.repo.get_weekly_winners(tenant.tenant_id, limit_weeks)

        weeks_dict: dict = {}
        for w in raw:
            key = w.week_start
            weeks_dict.setdefault(key, []).append(w)

        weeks: list[HallOfFameWeek] = []
        for week_start in sorted(weeks_dict.keys(), reverse=True):
            week_end = week_start + timedelta(days=6)
            label = (
                f"{week_start.strftime('%b')} {week_start.day} – "
                f"{week_end.strftime('%b')} {week_end.day}"
            )
            weeks.append(
                HallOfFameWeek(
                    week_start=week_start.isoformat(),
                    week_end=week_end.isoformat(),
                    week_label=label,
                    winners=[
                        self._winner_out(w)
                        for w in sorted(weeks_dict[week_start], key=lambda x: x.rank)
                    ],
                )
            )

        return HallOfFameResponse(weeks=weeks)

    async def list_shoutouts(
        self,
        tenant: TenantContext,
        student_id: uuid.UUID | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> ShoutoutListResponse:
        from sqlalchemy import select
        from app.users.models import User

        shoutouts, total = await self.repo.list_shoutouts(
            tenant.tenant_id, student_id, limit, offset
        )
        items: list[ShoutoutOut] = []
        for s in shoutouts:
            from_user = await self.db.get(User, s.from_user_id)
            to_user = await self.db.get(User, s.to_student_id)
            items.append(
                ShoutoutOut(
                    id=s.id,
                    from_user_id=s.from_user_id,
                    from_user_name=f"{from_user.first_name} {from_user.last_name}".strip() if from_user else "Someone",
                    to_student_id=s.to_student_id,
                    to_student_name=f"{to_user.first_name} {to_user.last_name}".strip() if to_user else "Student",
                    message=s.message,
                    emoji=s.emoji,
                    classroom_id=s.classroom_id,
                    created_at=s.created_at,
                )
            )
        return ShoutoutListResponse(items=items, total=total)
