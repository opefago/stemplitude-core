import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeeklyWinner(Base):
    """Top student(s) for a given ISO week, crowned by an admin."""

    __tablename__ = "weekly_winners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_name: Mapped[str] = mapped_column(String(200), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    xp_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    crowned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    crowned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "student_id", "week_start", name="uq_winner_tenant_student_week"),
    )


class XPTransaction(Base):
    """Immutable ledger of every XP award event for a student."""

    __tablename__ = "xp_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    # source: 'lesson' | 'lab' | 'badge' | 'session' | 'shoutout' | 'manual'
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class BadgeDefinition(Base):
    """Platform or tenant badge catalogue entry."""

    __tablename__ = "badge_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # null tenant_id = platform-wide badge available to all tenants
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon_slug: Mapped[str] = mapped_column(String(80), nullable=False, default="trophy")  # lucide icon name
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#ffc800")
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="general")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (UniqueConstraint("tenant_id", "slug", name="uq_badge_tenant_slug"),)


class StudentBadge(Base):
    """Junction: a badge awarded to a specific student."""

    __tablename__ = "student_badges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("badge_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    awarded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (UniqueConstraint("student_id", "badge_id", name="uq_student_badge"),)


class Streak(Base):
    """Running streak counter per student per tenant."""

    __tablename__ = "streaks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (UniqueConstraint("student_id", "tenant_id", name="uq_streak_student_tenant"),)


class Shoutout(Base):
    """Public praise sent by an instructor or admin to a student."""

    __tablename__ = "shoutouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🌟")
    classroom_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class GamificationGoal(Base):
    """Tenant-scoped instructor-configured goal template."""

    __tablename__ = "gamification_goals"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lab_type", "name", name="uq_gamification_goals_tenant_lab_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    # {"events":[...], "context_match":{"key":"value"}}
    event_map: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # ["closed_loop_exists", ...] or richer objects in future
    conditions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # {"type":"points","value":10} or {"type":"reward","reward_kind":"badge","badge_slug":"..."}
    reward: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class LabEventStream(Base):
    """Normalized tenant lab events consumed by gamification evaluator."""

    __tablename__ = "lab_event_stream"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    lab_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    goal_matches: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    points_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
