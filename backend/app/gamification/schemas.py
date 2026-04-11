from __future__ import annotations

import uuid
from datetime import date, datetime

from typing import Any

from pydantic import BaseModel, Field

# ── Level thresholds ──────────────────────────────────────────────────────────
LEVELS: list[tuple[int, str, int]] = [
    (1, "Explorer", 0),
    (2, "Spark", 100),
    (3, "Builder", 300),
    (4, "Creator", 600),
    (5, "Inventor", 1_000),
    (6, "Engineer", 1_500),
    (7, "Code Wizard", 2_100),
    (8, "Innovator", 2_800),
    (9, "Master", 3_600),
    (10, "Legend", 5_000),
]


def calculate_level(total_xp: int) -> tuple[int, str, int, int]:
    """Return (level, level_name, xp_start, xp_end)."""
    current_level, current_name, current_start = LEVELS[0]
    for i, (level, name, threshold) in enumerate(LEVELS):
        if total_xp >= threshold:
            current_level, current_name, current_start = level, name, threshold
        else:
            return current_level, current_name, current_start, threshold
    last = LEVELS[-1]
    return last[0], last[1], last[2], last[2] + 1_000


# ── Badge schemas ─────────────────────────────────────────────────────────────

class BadgeDefinitionOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str
    icon_slug: str
    color: str
    xp_reward: int
    category: str

    model_config = {"from_attributes": True}


class StudentBadgeOut(BaseModel):
    id: uuid.UUID
    badge: BadgeDefinitionOut
    awarded_at: datetime
    awarded_by_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class AwardBadgeRequest(BaseModel):
    student_id: uuid.UUID
    badge_slug: str


class RevokeBadgeRequest(BaseModel):
    student_id: uuid.UUID
    badge_slug: str


# ── XP schemas ────────────────────────────────────────────────────────────────

class XPTransactionOut(BaseModel):
    id: uuid.UUID
    amount: int
    reason: str
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AwardXPRequest(BaseModel):
    student_id: uuid.UUID
    amount: int = Field(ge=1, le=10_000)
    reason: str = Field(min_length=1, max_length=200)
    source: str = "manual"


# ── Streak schemas ────────────────────────────────────────────────────────────

class StreakDaySummaryOut(BaseModel):
    date: date
    weekday: str
    # True when this local calendar day is part of the current consecutive streak
    # (matches current_streak / last_activity_date), not merely “had activity this week”.
    active: bool
    is_today: bool


class StreakOut(BaseModel):
    current_streak: int
    best_streak: int
    # Calendar date in the zone used when the streak was last updated (X-Calendar-TZ / tenant).
    last_activity_date: date | None = None
    seven_day_summary: list[StreakDaySummaryOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── Shoutout schemas ──────────────────────────────────────────────────────────

class CreateShoutoutRequest(BaseModel):
    to_student_id: uuid.UUID
    message: str = Field(min_length=1, max_length=500)
    emoji: str = Field(default="🌟", max_length=10)
    classroom_id: uuid.UUID | None = None


class ShoutoutOut(BaseModel):
    id: uuid.UUID
    from_user_id: uuid.UUID
    from_user_name: str
    to_student_id: uuid.UUID
    to_student_name: str
    message: str
    emoji: str
    classroom_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ShoutoutListResponse(BaseModel):
    items: list[ShoutoutOut]
    total: int


# ── Weekly winners schemas ────────────────────────────────────────────────────

class WeeklyWinnerOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    week_start: str
    week_end: str
    xp_earned: int
    rank: int
    crowned_at: datetime

    model_config = {"from_attributes": True}


class HallOfFameWeek(BaseModel):
    week_start: str
    week_end: str
    week_label: str
    winners: list[WeeklyWinnerOut]


class HallOfFameResponse(BaseModel):
    weeks: list[HallOfFameWeek]


class CrownWinnersRequest(BaseModel):
    top_n: int = Field(default=3, ge=1, le=10)


# ── Leaderboard schemas ───────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    student_id: uuid.UUID
    student_name: str
    total_xp: int
    level: int
    level_name: str
    badge_count: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    my_rank: int | None = None
    my_xp: int | None = None


# ── Student gamification profile ──────────────────────────────────────────────

class GamificationProfile(BaseModel):
    student_id: uuid.UUID
    total_xp: int
    level: int
    level_name: str
    xp_start: int
    xp_end: int
    streak: StreakOut
    badges: list[StudentBadgeOut]
    recent_xp: list[XPTransactionOut]
    stats: GamificationStats


class GamificationStats(BaseModel):
    total_lessons_completed: int = 0
    total_labs_completed: int = 0
    total_badges: int = 0
    total_shoutouts_received: int = 0


GamificationProfile.model_rebuild()


# ── Tenant-focused gamification config + goals ───────────────────────────────

LabType = str
RewardType = str


class TenantGamificationConfig(BaseModel):
    mode: str = Field(default="balanced", pattern="^(academic|light|balanced|full)$")
    enabled: bool = True
    enabled_labs: list[LabType] = Field(default_factory=list)
    max_points_per_event: int = Field(default=50, ge=1, le=500)
    allow_badges: bool = True
    allow_live_recognition: bool = True
    allow_leaderboard: bool = True
    allow_streaks: bool = True


class UpdateTenantGamificationConfigRequest(BaseModel):
    mode: str | None = Field(default=None, pattern="^(academic|light|balanced|full)$")
    enabled: bool | None = None
    enabled_labs: list[LabType] | None = None
    max_points_per_event: int | None = Field(default=None, ge=1, le=500)
    allow_badges: bool | None = None
    allow_live_recognition: bool | None = None
    allow_leaderboard: bool | None = None
    allow_streaks: bool | None = None


class GoalEventMap(BaseModel):
    events: list[str] = Field(min_length=1)
    context_match: dict[str, str | int | float | bool] = Field(default_factory=dict)


class GoalReward(BaseModel):
    type: RewardType = Field(pattern="^(points|reward)$")
    value: int | None = Field(default=None, ge=1, le=500)
    reward_kind: str | None = Field(default=None, pattern="^(badge|hi-five|sticker|custom)$")
    badge_slug: str | None = None
    icon: str | None = None


class GamificationGoalCreateRequest(BaseModel):
    lab_type: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=2000)
    is_active: bool = True
    event_map: GoalEventMap
    conditions: list[str | dict[str, Any]] = Field(default_factory=list)
    reward: GoalReward


class GamificationGoalUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    event_map: GoalEventMap | None = None
    conditions: list[str | dict[str, Any]] | None = None
    reward: GoalReward | None = None


class GamificationGoalOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    lab_type: str
    name: str
    description: str
    is_active: bool
    event_map: GoalEventMap
    conditions: list[str | dict[str, Any]]
    reward: GoalReward
    created_by_id: uuid.UUID | None = None
    updated_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LabEventIngestRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    lab_id: str = Field(min_length=1, max_length=120)
    lab_type: str = Field(min_length=1, max_length=60)
    context: dict = Field(default_factory=dict)
    timestamp: datetime
    dry_run: bool = False


class LabEventGoalMatch(BaseModel):
    goal_id: uuid.UUID
    goal_name: str
    reward_type: str
    points_awarded: int = 0
    reward_kind: str | None = None


class LabEventIngestResponse(BaseModel):
    processed: bool
    points_awarded_total: int
    matched_goals: list[LabEventGoalMatch]
