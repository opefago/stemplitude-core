from __future__ import annotations

import uuid
from datetime import datetime

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

class StreakOut(BaseModel):
    current_streak: int
    best_streak: int

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
