"""014_weekly_winners

Revision ID: 014
Revises: 013_gamification
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014"
down_revision = "013_gamification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_winners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("student_name", sa.String(200), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False, index=True),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("xp_earned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rank", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "crowned_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "crowned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id", "student_id", "week_start",
            name="uq_winner_tenant_student_week",
        ),
    )


def downgrade() -> None:
    op.drop_table("weekly_winners")
