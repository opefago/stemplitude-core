from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core.calendar_tz import get_optional_request_calendar_tz
from app.core.redis import get_redis
from app.dependencies import TenantContext
from app.tenants.models import Tenant

from .repository import GamificationRepository
from .streak_side_effects import bump_student_streak
from .schemas import (
    GamificationGoalCreateRequest,
    GamificationGoalOut,
    GamificationGoalUpdateRequest,
    CrownWinnersRequest,
    GamificationProfile,
    GamificationStats,
    HallOfFameResponse,
    HallOfFameWeek,
    LabEventGoalMatch,
    LabEventIngestRequest,
    LabEventIngestResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    TenantGamificationConfig,
    UpdateTenantGamificationConfigRequest,
    ShoutoutOut,
    ShoutoutListResponse,
    StreakDaySummaryOut,
    StreakOut,
    StudentBadgeOut,
    BadgeDefinitionOut,
    WeeklyWinnerOut,
    XPTransactionOut,
    calculate_level,
)


def _calendar_zone(tz_name: str | None) -> ZoneInfo:
    raw = (tz_name or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(raw)
    except Exception:
        return ZoneInfo("UTC")


class GamificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = GamificationRepository(db)
        self.db = db

    async def _resolve_streak_calendar_tz(self, tenant_id: uuid.UUID) -> str:
        """IANA zone for streak day boundaries: X-Calendar-TZ, then tenant settings, else UTC."""
        header_tz = get_optional_request_calendar_tz()
        if header_tz:
            logger.debug(
                "streak_tz_resolve tenant=%s source=request_header_or_ctx resolved=%r",
                tenant_id,
                header_tz,
            )
            return header_tz
        tenant_row = await self.db.get(Tenant, tenant_id)
        settings = (
            tenant_row.settings
            if tenant_row and isinstance(tenant_row.settings, dict)
            else {}
        )
        for key in ("timezone", "calendar_tz", "time_zone"):
            raw = settings.get(key)
            if isinstance(raw, str) and raw.strip():
                try:
                    ZoneInfo(raw.strip())
                    logger.debug(
                        "streak_tz_resolve tenant=%s source=tenant_settings key=%s resolved=%r",
                        tenant_id,
                        key,
                        raw.strip(),
                    )
                    return raw.strip()
                except Exception:
                    continue
        logger.debug(
            "streak_tz_resolve tenant=%s source=fallback resolved=UTC (no header/ctx, no valid tenant tz)",
            tenant_id,
        )
        return "UTC"

    @staticmethod
    def _default_tenant_gamification_config() -> TenantGamificationConfig:
        return TenantGamificationConfig(
            mode="balanced",
            enabled=True,
            enabled_labs=[],
            max_points_per_event=50,
            allow_badges=True,
            allow_live_recognition=True,
            allow_leaderboard=True,
            allow_streaks=True,
        )

    @staticmethod
    def _streak_summary_cache_key(
        tenant_id: uuid.UUID,
        student_id: uuid.UUID,
        tz_key: str,
        today_local: date,
        current_streak: int,
        last_activity_date: date | None,
    ) -> str:
        last_s = last_activity_date.isoformat() if last_activity_date else "none"
        return (
            f"gamification:streak_summary:{tenant_id}:{student_id}:"
            f"{tz_key}:{today_local.isoformat()}:{current_streak}:{last_s}"
        )

    async def _build_seven_day_streak_summary(
        self,
        student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        *,
        calendar_tz: str,
        current_streak: int,
        last_activity_date: date | None,
    ) -> list[StreakDaySummaryOut]:
        tz = _calendar_zone(calendar_tz)
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc.astimezone(tz)
        today_local = now_local.date()

        # Streak rows store last_activity_date as a calendar date in the same zone used
        # when updating (X-Calendar-TZ or tenant timezone); week cells use calendar_tz.
        streak_local_dates: set[date] = set()
        if last_activity_date is not None and current_streak > 0:
            for i in range(current_streak):
                streak_local_dates.add(last_activity_date - timedelta(days=i))

        cache_key = self._streak_summary_cache_key(
            tenant_id,
            student_id,
            tz.key,
            today_local,
            current_streak,
            last_activity_date,
        )
        try:
            redis = await get_redis()
            raw_cached = await redis.get(cache_key)
            if raw_cached:
                decoded = json.loads(raw_cached)
                return [StreakDaySummaryOut.model_validate(item) for item in decoded]
        except Exception:
            logger.exception(
                "Failed reading streak summary cache student=%s tenant=%s",
                student_id,
                tenant_id,
            )

        # Sunday -> Saturday in the viewer's local calendar (not UTC).
        days_since_sunday = (today_local.weekday() + 1) % 7
        week_start_local = today_local - timedelta(days=days_since_sunday)

        summary: list[StreakDaySummaryOut] = []
        for index in range(7):
            day = week_start_local + timedelta(days=index)
            summary.append(
                StreakDaySummaryOut(
                    date=day,
                    weekday=datetime.combine(day, time.min, tzinfo=tz).strftime("%a"),
                    active=day in streak_local_dates,
                    is_today=day == today_local,
                )
            )

        next_local_midnight = today_local + timedelta(days=1)
        next_boundary_utc = datetime.combine(
            next_local_midnight, time.min, tzinfo=tz
        ).astimezone(timezone.utc)
        ttl_seconds = max(60, int((next_boundary_utc - now_utc).total_seconds()))
        ttl_seconds = min(ttl_seconds, 86400)
        try:
            redis = await get_redis()
            await redis.set(
                cache_key,
                json.dumps([item.model_dump(mode="json") for item in summary]),
                ex=ttl_seconds,
            )
        except Exception:
            logger.exception(
                "Failed writing streak summary cache student=%s tenant=%s",
                student_id,
                tenant_id,
            )
        return summary

    async def _invalidate_streak_summary_cache(self, student_id: uuid.UUID, tenant_id: uuid.UUID) -> None:
        """Invalidate cached streak summaries for this student (all calendar_tz keys)."""
        prefix = f"gamification:streak_summary:{tenant_id}:{student_id}:"
        try:
            redis = await get_redis()
            async for key in redis.scan_iter(match=f"{prefix}*"):
                await redis.delete(key)
        except Exception:
            logger.exception(
                "Failed invalidating streak summary cache student=%s tenant=%s",
                student_id,
                tenant_id,
            )

    async def get_tenant_config(self, tenant: TenantContext) -> TenantGamificationConfig:
        tenant_row = await self.db.get(Tenant, tenant.tenant_id)
        settings = (tenant_row.settings if tenant_row and tenant_row.settings else {}) if tenant_row else {}
        raw = settings.get("gamification_config", {})
        default = self._default_tenant_gamification_config().model_dump()
        merged = {**default, **raw}
        return TenantGamificationConfig.model_validate(merged)

    async def update_tenant_config(
        self,
        tenant: TenantContext,
        data: UpdateTenantGamificationConfigRequest,
    ) -> TenantGamificationConfig:
        tenant_row = await self.db.get(Tenant, tenant.tenant_id)
        if tenant_row is None:
            raise ValueError("Tenant not found")

        existing = await self.get_tenant_config(tenant)
        merged = existing.model_dump()
        patch = data.model_dump(exclude_unset=True)
        merged.update(patch)
        updated = TenantGamificationConfig.model_validate(merged)

        settings = dict(tenant_row.settings or {})
        settings["gamification_config"] = updated.model_dump()
        tenant_row.settings = settings
        await self.db.commit()
        return updated

    async def get_profile(
        self,
        student_id: uuid.UUID,
        tenant: TenantContext,
        *,
        calendar_tz: str = "UTC",
    ) -> GamificationProfile:
        tid = tenant.tenant_id
        total_xp = await self.repo.get_total_xp(student_id, tid)
        level, level_name, xp_start, xp_end = calculate_level(total_xp)
        streak = await self.repo.get_streak(student_id, tid)
        if streak is None:
            streak = StreakOut(current_streak=0, best_streak=0)
        streak_payload = StreakOut.model_validate(streak)
        logger.debug(
            "gamification get_profile streak_display student=%s tenant=%s query_calendar_tz=%r current=%s last_activity_date=%s",
            student_id,
            tid,
            calendar_tz,
            streak_payload.current_streak,
            streak_payload.last_activity_date.isoformat()
            if streak_payload.last_activity_date
            else None,
        )
        streak_payload.seven_day_summary = await self._build_seven_day_streak_summary(
            student_id,
            tid,
            calendar_tz=calendar_tz,
            current_streak=streak_payload.current_streak,
            last_activity_date=streak_payload.last_activity_date,
        )
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
            streak=streak_payload,
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
        cfg = await self.get_tenant_config(tenant)
        if cfg.allow_streaks:
            cal_tz = await self._resolve_streak_calendar_tz(tenant.tenant_id)
            await self.repo.update_streak(
                student_id, tenant.tenant_id, calendar_tz=cal_tz
            )
            await self._invalidate_streak_summary_cache(student_id, tenant.tenant_id)
        await self.db.commit()

    async def track_student_activity(
        self,
        student_id: uuid.UUID,
        tenant: TenantContext,
    ) -> None:
        """Persist/update streak progress for any qualifying student activity."""
        cfg = await self.get_tenant_config(tenant)
        if not cfg.allow_streaks:
            return
        cal_tz = await self._resolve_streak_calendar_tz(tenant.tenant_id)
        await self.repo.update_streak(student_id, tenant.tenant_id, calendar_tz=cal_tz)
        await self._invalidate_streak_summary_cache(student_id, tenant.tenant_id)
        await self.db.commit()

    async def track_students_activity_batch(
        self,
        student_ids: Iterable[uuid.UUID],
        tenant: TenantContext,
    ) -> None:
        """Update streaks for many students in one transaction (e.g. auto-attendance)."""
        ordered = list(dict.fromkeys(student_ids))
        if not ordered:
            return
        cfg = await self.get_tenant_config(tenant)
        if not cfg.allow_streaks:
            return
        cal_tz = await self._resolve_streak_calendar_tz(tenant.tenant_id)
        for sid in ordered:
            await self.repo.update_streak(sid, tenant.tenant_id, calendar_tz=cal_tz)
            await self._invalidate_streak_summary_cache(sid, tenant.tenant_id)
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

    async def revoke_badge(
        self,
        student_id: uuid.UUID,
        badge_slug: str,
        tenant: TenantContext,
    ) -> bool:
        """Delete student_badge row. Does not reverse XP from when the badge was earned."""
        defn = await self.repo.get_badge_by_slug(badge_slug.strip(), tenant.tenant_id)
        if not defn:
            return False
        ok = await self.repo.revoke_badge(student_id, defn.id, tenant.tenant_id)
        if ok:
            await self.db.commit()
        return ok

    async def get_leaderboard(
        self, tenant: TenantContext, limit: int = 10, current_student_id: uuid.UUID | None = None
    ) -> LeaderboardResponse:
        cfg = await self.get_tenant_config(tenant)
        if not cfg.allow_leaderboard:
            return LeaderboardResponse(entries=[], my_rank=None, my_xp=0)
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
        cfg = await self.get_tenant_config(tenant)
        if cfg.enabled and cfg.mode != "academic":
            await self.repo.add_xp(
                to_student_id,
                tenant.tenant_id,
                10,
                f"Shoutout from {from_user_name}",
                "shoutout",
                s.id,
            )
        if cfg.allow_streaks:
            cal_tz = await self._resolve_streak_calendar_tz(tenant.tenant_id)
            await self.repo.update_streak(
                to_student_id, tenant.tenant_id, calendar_tz=cal_tz
            )
            await self._invalidate_streak_summary_cache(to_student_id, tenant.tenant_id)
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

    async def _week_bounds_for_tenant(self, tenant: TenantContext) -> tuple[date, date]:
        """Monday–Sunday week boundaries in the same zone as streaks (header/query, tenant, UTC)."""
        cal_tz_name = await self._resolve_streak_calendar_tz(tenant.tenant_id)
        tz = _calendar_zone(cal_tz_name)
        today_local = datetime.now(timezone.utc).astimezone(tz).date()
        week_start = today_local - timedelta(days=today_local.weekday())
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
        week_start, week_end = await self._week_bounds_for_tenant(tenant)

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
        week_start, _ = await self._week_bounds_for_tenant(tenant)
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
        from app.students.models import Student

        shoutouts, total = await self.repo.list_shoutouts(
            tenant.tenant_id, student_id, limit, offset
        )
        items: list[ShoutoutOut] = []
        for s in shoutouts:
            from_user = await self.db.get(User, s.from_user_id)
            to_student = await self.db.get(Student, s.to_student_id)
            items.append(
                ShoutoutOut(
                    id=s.id,
                    from_user_id=s.from_user_id,
                    from_user_name=f"{from_user.first_name} {from_user.last_name}".strip() if from_user else "Someone",
                    to_student_id=s.to_student_id,
                    to_student_name=(
                        f"{to_student.first_name} {to_student.last_name}".strip()
                        if to_student
                        else "Student"
                    ),
                    message=s.message,
                    emoji=s.emoji,
                    classroom_id=s.classroom_id,
                    created_at=s.created_at,
                )
            )
        return ShoutoutListResponse(items=items, total=total)

    async def create_goal(
        self,
        tenant: TenantContext,
        created_by_id: uuid.UUID | None,
        data: GamificationGoalCreateRequest,
    ) -> GamificationGoalOut:
        goal = await self.repo.create_goal(
            tenant_id=tenant.tenant_id,
            created_by_id=created_by_id,
            lab_type=data.lab_type,
            name=data.name,
            description=data.description,
            is_active=data.is_active,
            event_map=data.event_map.model_dump(),
            conditions=list(data.conditions),
            reward=data.reward.model_dump(exclude_none=True),
        )
        await self.db.commit()
        return self._goal_to_out(goal)

    async def list_goals(
        self,
        tenant: TenantContext,
        lab_type: str | None = None,
        is_active: bool | None = None,
    ) -> list[GamificationGoalOut]:
        rows = await self.repo.list_goals(tenant.tenant_id, lab_type=lab_type, is_active=is_active)
        out: list[GamificationGoalOut] = []
        for row in rows:
            try:
                out.append(self._goal_to_out(row))
            except Exception:
                logger.exception(
                    "Skipping malformed gamification goal during list_goals",
                    extra={"goal_id": str(getattr(row, "id", "")), "tenant_id": str(tenant.tenant_id)},
                )
        return out

    async def update_goal(
        self,
        tenant: TenantContext,
        goal_id: uuid.UUID,
        updated_by_id: uuid.UUID | None,
        data: GamificationGoalUpdateRequest,
    ) -> GamificationGoalOut | None:
        goal = await self.repo.get_goal(tenant.tenant_id, goal_id)
        if goal is None:
            return None
        patch = data.model_dump(exclude_unset=True, exclude_none=True)
        if "name" in patch:
            goal.name = patch["name"]
        if "description" in patch:
            goal.description = patch["description"]
        if "is_active" in patch:
            goal.is_active = patch["is_active"]
        if "event_map" in patch:
            goal.event_map = patch["event_map"]
        if "conditions" in patch:
            goal.conditions = patch["conditions"]
        if "reward" in patch:
            goal.reward = patch["reward"]
        goal.updated_by_id = updated_by_id
        await self.db.commit()
        return self._goal_to_out(goal)

    @staticmethod
    def _goal_to_out(goal) -> GamificationGoalOut:
        event_map_raw = goal.event_map if isinstance(goal.event_map, dict) else {}
        events = event_map_raw.get("events")
        if not isinstance(events, list):
            events = []
        events = [str(item) for item in events if str(item).strip()]
        if not events:
            legacy_event = event_map_raw.get("event_type") or event_map_raw.get("event")
            if isinstance(legacy_event, str) and legacy_event.strip():
                events = [legacy_event]
            else:
                # Defensive default for legacy/broken records so list endpoint never 500s.
                events = ["OBJECT_CONNECTED"]
        raw_context_match = (
            event_map_raw.get("context_match")
            if isinstance(event_map_raw.get("context_match"), dict)
            else {}
        )
        context_match: dict[str, str | int | float | bool] = {}
        for key, value in raw_context_match.items():
            k = str(key)
            if isinstance(value, (str, int, float, bool)):
                context_match[k] = value
            else:
                context_match[k] = str(value)

        reward_raw = goal.reward if isinstance(goal.reward, dict) else {}
        reward_type = str(reward_raw.get("type") or "points")
        if reward_type not in {"points", "reward"}:
            reward_type = "points"
        value = reward_raw.get("value")
        try:
            value_int = int(value) if value is not None else None
        except (TypeError, ValueError):
            value_int = None
        if reward_type == "points":
            value_int = max(1, value_int or 1)
        reward_kind = reward_raw.get("reward_kind")
        if reward_type == "reward" and reward_kind not in {"badge", "hi-five", "sticker", "custom"}:
            reward_kind = "badge"

        conditions_raw = goal.conditions
        if isinstance(conditions_raw, list):
            conditions = conditions_raw
        elif conditions_raw is None:
            conditions = []
        else:
            conditions = [conditions_raw]

        return GamificationGoalOut.model_validate(
            {
                "id": goal.id,
                "tenant_id": goal.tenant_id,
                "lab_type": goal.lab_type,
                "name": goal.name,
                "description": goal.description or "",
                "is_active": bool(goal.is_active),
                "event_map": {
                    "events": events,
                    "context_match": context_match,
                },
                "conditions": conditions,
                "reward": {
                    "type": reward_type,
                    "value": value_int if reward_type == "points" else None,
                    "reward_kind": reward_kind if reward_type == "reward" else None,
                    "badge_slug": reward_raw.get("badge_slug"),
                    "icon": reward_raw.get("icon"),
                },
                "created_by_id": goal.created_by_id,
                "updated_by_id": goal.updated_by_id,
                "created_at": goal.created_at,
                "updated_at": goal.updated_at,
            }
        )

    async def delete_goal(self, tenant: TenantContext, goal_id: uuid.UUID) -> bool:
        ok = await self.repo.delete_goal(tenant.tenant_id, goal_id)
        if not ok:
            return False
        await self.db.commit()
        return True

    @staticmethod
    def _read_context_value(actual: dict, key: str):
        if key in actual:
            return actual.get(key)
        if "." not in key:
            return actual.get(key)
        current = actual
        for part in key.split("."):
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        return current

    @staticmethod
    def _matches_numeric_expression(actual_value, expected: str) -> bool:
        if not isinstance(expected, str):
            return False
        expr = expected.strip()
        ops = [">=", "<=", ">", "<"]
        op = next((candidate for candidate in ops if expr.startswith(candidate)), None)
        if not op:
            return False
        try:
            threshold = float(expr[len(op):].strip())
            actual_num = float(actual_value)
        except (TypeError, ValueError):
            return False
        if op == ">=":
            return actual_num >= threshold
        if op == "<=":
            return actual_num <= threshold
        if op == ">":
            return actual_num > threshold
        return actual_num < threshold

    @staticmethod
    def _matches_context(required: dict, actual: dict) -> bool:
        for key, expected in required.items():
            # Allow wildcard matching in goal context conditions.
            if isinstance(expected, str) and expected.strip().lower() in {"any", "*", "__any__"}:
                continue
            actual_value = GamificationService._read_context_value(actual, str(key))
            if GamificationService._matches_numeric_expression(actual_value, str(expected)):
                continue
            if isinstance(actual_value, list):
                if expected not in actual_value and str(expected) not in [str(item) for item in actual_value]:
                    return False
                continue
            if str(actual_value) == str(expected):
                continue
            if actual_value != expected:
                return False
        return True

    def _matches_puzzle_node(self, node: dict, data: LabEventIngestRequest) -> bool:
        kind = str(node.get("kind") or "")
        context = data.context or {}
        if kind == "action":
            event_type = node.get("event_type")
            if event_type and str(event_type) != data.event_type:
                return False
            node_context = node.get("context")
            if isinstance(node_context, dict) and node_context:
                if not self._matches_context(node_context, context):
                    return False
            return True

        if kind != "group":
            return True

        children = node.get("children")
        if not isinstance(children, list):
            return True
        if not children:
            return True

        results = [
            self._matches_puzzle_node(child, data)
            for child in children
            if isinstance(child, dict)
        ]
        if not results:
            return True
        group_op = str(node.get("group_op") or "all")
        if group_op == "any":
            return any(results)
        # For now sequence is evaluated as all children true for a single event.
        if group_op == "sequence":
            return all(results)
        return all(results)

    def _matches_graph_node(
        self,
        node: dict,
        children_map: dict[str, list[str]],
        node_index: dict[str, dict],
        data: LabEventIngestRequest,
    ) -> bool:
        kind = str(node.get("kind") or "")
        context = data.context or {}

        if kind == "action":
            event_type = node.get("event_type")
            if event_type and str(event_type) != data.event_type:
                return False
            node_context = node.get("context")
            if isinstance(node_context, dict) and node_context:
                if not self._matches_context(node_context, context):
                    return False
            return True

        child_ids = children_map.get(str(node.get("id") or ""), [])
        child_nodes = [node_index.get(child_id) for child_id in child_ids]
        child_nodes = [child for child in child_nodes if isinstance(child, dict)]
        if not child_nodes:
            return True

        results = [
            self._matches_graph_node(child, children_map, node_index, data)
            for child in child_nodes
        ]
        if not results:
            return True

        group_op = str(node.get("group_op") or "all")
        if group_op == "any":
            return any(results)
        # Sequence currently means all child predicates for this single event.
        return all(results)

    def _matches_node_graph_condition(self, condition: dict, data: LabEventIngestRequest) -> bool:
        graph_nodes_raw = condition.get("nodes")
        graph_edges_raw = condition.get("edges")
        if not isinstance(graph_nodes_raw, list) or not graph_nodes_raw:
            return True

        node_index: dict[str, dict] = {}
        for node in graph_nodes_raw:
            if not isinstance(node, dict):
                continue
            node_id = str(node.get("id") or "")
            if not node_id:
                continue
            node_index[node_id] = node

        if not node_index:
            return True

        children_map: dict[str, list[str]] = {}
        incoming_count: dict[str, int] = {node_id: 0 for node_id in node_index}
        if isinstance(graph_edges_raw, list):
            for edge in graph_edges_raw:
                if not isinstance(edge, dict):
                    continue
                source = str(edge.get("source") or "")
                target = str(edge.get("target") or "")
                if source not in node_index or target not in node_index:
                    continue
                children_map.setdefault(source, []).append(target)
                incoming_count[target] = incoming_count.get(target, 0) + 1

        root_ids = [node_id for node_id, count in incoming_count.items() if count == 0]
        if not root_ids:
            root_ids = list(node_index.keys())

        results = [
            self._matches_graph_node(node_index[root_id], children_map, node_index, data)
            for root_id in root_ids
            if root_id in node_index
        ]
        if not results:
            return True
        return all(results)

    def _matches_goal_conditions(
        self,
        conditions: list[str | dict] | None,
        data: LabEventIngestRequest,
    ) -> bool:
        if not conditions:
            return True
        for condition in conditions:
            if not isinstance(condition, dict):
                continue
            if str(condition.get("kind") or "") != "puzzle_graph":
                if str(condition.get("kind") or "") == "node_graph":
                    if not self._matches_node_graph_condition(condition, data):
                        return False
                continue
            root = condition.get("root")
            if not isinstance(root, list):
                continue
            if not root:
                continue
            root_results = [
                self._matches_puzzle_node(node, data)
                for node in root
                if isinstance(node, dict)
            ]
            if root_results and not all(root_results):
                return False
        return True

    async def ingest_lab_event(
        self,
        tenant: TenantContext,
        user_id: uuid.UUID,
        data: LabEventIngestRequest,
    ) -> LabEventIngestResponse:
        cfg = await self.get_tenant_config(tenant)
        if not cfg.enabled:
            if not data.dry_run:
                await self.repo.create_lab_event(
                    tenant_id=tenant.tenant_id,
                    user_id=user_id,
                    lab_id=data.lab_id,
                    lab_type=data.lab_type,
                    event_type=data.event_type,
                    context=data.context,
                    occurred_at=data.timestamp,
                    goal_matches=[],
                    points_awarded=0,
                )
                await self.db.commit()
                await bump_student_streak(user_id, tenant.tenant_id)
            return LabEventIngestResponse(processed=False, points_awarded_total=0, matched_goals=[])

        if cfg.enabled_labs and data.lab_type not in cfg.enabled_labs:
            if not data.dry_run:
                await self.repo.create_lab_event(
                    tenant_id=tenant.tenant_id,
                    user_id=user_id,
                    lab_id=data.lab_id,
                    lab_type=data.lab_type,
                    event_type=data.event_type,
                    context=data.context,
                    occurred_at=data.timestamp,
                    goal_matches=[],
                    points_awarded=0,
                )
                await self.db.commit()
                await bump_student_streak(user_id, tenant.tenant_id)
            return LabEventIngestResponse(processed=False, points_awarded_total=0, matched_goals=[])

        goals = await self.repo.list_goals(tenant.tenant_id, lab_type=data.lab_type, is_active=True)
        matched: list[LabEventGoalMatch] = []
        total_points = 0
        mode_multiplier = {
            "academic": 0.0,
            "light": 0.5,
            "balanced": 1.0,
            "full": 1.5,
        }.get(cfg.mode, 1.0)

        for goal in goals:
            event_map = dict(goal.event_map or {})
            eligible_events = list(event_map.get("events", []))
            if data.event_type not in eligible_events:
                continue
            required = dict(event_map.get("context_match", {}))
            if required and not self._matches_context(required, data.context or {}):
                continue
            if not self._matches_goal_conditions(goal.conditions, data):
                continue

            reward = dict(goal.reward or {})
            reward_type = str(reward.get("type", "points"))
            awarded = 0
            reward_kind = reward.get("reward_kind")

            if reward_type == "points" and cfg.mode != "academic":
                base_value = int(reward.get("value") or 0)
                scaled = int(round(base_value * mode_multiplier))
                awarded = max(0, min(scaled, cfg.max_points_per_event))
                if awarded > 0 and not data.dry_run:
                    await self.repo.add_xp(
                        student_id=user_id,
                        tenant_id=tenant.tenant_id,
                        amount=awarded,
                        reason=f"Lab goal completed: {goal.name}",
                        source="lab",
                        source_id=goal.id,
                    )
                total_points += awarded
            elif reward_type == "reward" and cfg.allow_badges:
                if reward_kind == "badge" and reward.get("badge_slug"):
                    if not data.dry_run:
                        await self.award_badge(
                            student_id=user_id,
                            badge_slug=str(reward["badge_slug"]),
                            tenant=tenant,
                            awarded_by_id=None,
                        )

            matched.append(
                LabEventGoalMatch(
                    goal_id=goal.id,
                    goal_name=goal.name,
                    reward_type=reward_type,
                    points_awarded=awarded,
                    reward_kind=reward_kind,
                )
            )

        if not data.dry_run:
            await self.repo.create_lab_event(
                tenant_id=tenant.tenant_id,
                user_id=user_id,
                lab_id=data.lab_id,
                lab_type=data.lab_type,
                event_type=data.event_type,
                context=data.context,
                occurred_at=data.timestamp,
                goal_matches=[m.model_dump() for m in matched],
                points_awarded=total_points,
            )
            await self.db.commit()
            await bump_student_streak(user_id, tenant.tenant_id)
        return LabEventIngestResponse(
            processed=True,
            points_awarded_total=total_points,
            matched_goals=matched,
        )
