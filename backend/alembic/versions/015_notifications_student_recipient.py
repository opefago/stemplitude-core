"""Notifications: optional user_id, student_id for student inbox.

Revision ID: 015
Revises: 014
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_notifications_student_id", "notifications", ["student_id"])
    op.alter_column("notifications", "user_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_check_constraint(
        "ck_notifications_user_or_student",
        "notifications",
        "(user_id IS NOT NULL AND student_id IS NULL) OR (user_id IS NULL AND student_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_user_or_student", "notifications", type_="check")
    op.drop_index("ix_notifications_student_id", table_name="notifications")
    op.drop_column("notifications", "student_id")
    op.alter_column("notifications", "user_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
