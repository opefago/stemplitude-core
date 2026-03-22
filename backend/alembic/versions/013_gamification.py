"""Add gamification tables: xp_transactions, badge_definitions, student_badges, streaks, shoutouts.

Revision ID: 013_gamification
Revises: 012_messaging_conversations
Create Date: 2026-03-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "013_gamification"
down_revision: Union[str, None] = "012_messaging_conversations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Default platform-wide badges seeded on upgrade
PLATFORM_BADGES = [
    ("first-circuit",   "First Circuit",    "Complete your first circuit lab",        "zap",          "#f59e0b", 50,  "labs"),
    ("code-ninja",      "Code Ninja",        "Complete 5 coding labs",                 "target",       "#8b5cf6", 100, "labs"),
    ("3d-architect",    "3D Architect",      "Complete a 3D design project",           "box",          "#06b6d4", 75,  "labs"),
    ("week-streak",     "Week Streak",       "Maintain a 7-day activity streak",       "flame",        "#ec4899", 150, "streaks"),
    ("game-dev",        "Game Dev",          "Build and publish a game",               "gamepad-2",    "#10b981", 100, "labs"),
    ("python-master",   "Python Master",     "Complete all Python challenges",         "code-2",       "#6366f1", 200, "lessons"),
    ("design-pro",      "Design Pro",        "Complete 3 design projects",             "palette",      "#f97316", 100, "labs"),
    ("explorer",        "Explorer",          "Try every lab type",                     "compass",      "#14b8a6", 75,  "general"),
    ("first-lesson",    "First Lesson",      "Complete your first lesson",             "book-open",    "#22c55e", 25,  "lessons"),
    ("shoutout-star",   "Shoutout Star",     "Receive 5 shoutouts from instructors",   "star",         "#fbbf24", 100, "social"),
    ("team-player",     "Team Player",       "Participate in a group project",         "users",        "#818cf8", 50,  "social"),
    ("legend",          "Legend",            "Reach Level 10",                         "trophy",       "#f59e0b", 500, "levels"),
]


def upgrade() -> None:
    # badge_definitions
    op.create_table(
        "badge_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("icon_slug", sa.String(80), nullable=False, server_default="trophy"),
        sa.Column("color", sa.String(20), nullable=False, server_default="#ffc800"),
        sa.Column("xp_reward", sa.Integer, nullable=False, server_default="0"),
        sa.Column("category", sa.String(40), nullable=False, server_default="general"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_badge_tenant_slug"),
    )
    op.create_index("ix_badge_definitions_slug", "badge_definitions", ["slug"])
    op.create_index("ix_badge_definitions_tenant_id", "badge_definitions", ["tenant_id"])

    # student_badges
    op.create_table(
        "student_badges",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("badge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("awarded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("awarded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["badge_id"], ["badge_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["awarded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("student_id", "badge_id", name="uq_student_badge"),
    )
    op.create_index("ix_student_badges_student_id", "student_badges", ["student_id"])

    # xp_transactions
    op.create_table(
        "xp_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_xp_transactions_student_id", "xp_transactions", ["student_id"])
    op.create_index("ix_xp_transactions_created_at", "xp_transactions", ["created_at"])

    # streaks
    op.create_table(
        "streaks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("current_streak", sa.Integer, nullable=False, server_default="0"),
        sa.Column("best_streak", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_activity_date", sa.Date, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("student_id", "tenant_id", name="uq_streak_student_tenant"),
    )
    op.create_index("ix_streaks_student_id", "streaks", ["student_id"])

    # shoutouts
    op.create_table(
        "shoutouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("emoji", sa.String(10), nullable=False, server_default="🌟"),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_shoutouts_tenant_id", "shoutouts", ["tenant_id"])
    op.create_index("ix_shoutouts_to_student_id", "shoutouts", ["to_student_id"])
    op.create_index("ix_shoutouts_created_at", "shoutouts", ["created_at"])

    # Seed platform-wide badges (tenant_id = NULL)
    op.execute(
        sa.text(
            """
            INSERT INTO badge_definitions (id, tenant_id, slug, name, description, icon_slug, color, xp_reward, category)
            VALUES
            """
            + ",\n".join(
                f"(gen_random_uuid(), NULL, '{slug}', '{name}', '{desc}', '{icon}', '{color}', {xp}, '{cat}')"
                for slug, name, desc, icon, color, xp, cat in PLATFORM_BADGES
            )
        )
    )


def downgrade() -> None:
    op.drop_table("shoutouts")
    op.drop_table("streaks")
    op.drop_table("xp_transactions")
    op.drop_table("student_badges")
    op.drop_table("badge_definitions")
