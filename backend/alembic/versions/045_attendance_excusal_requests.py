"""Attendance excusal requests from guardians (parent flow + admin review).

Revision ID: 045_attendance_excusal
Revises: 044_class_session_reminder
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "045_attendance_excusal"
down_revision: Union[str, None] = "044_class_session_reminder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_excusal_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=2000), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["classroom_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_attendance_excusal_tenant_status",
        "attendance_excusal_requests",
        ["tenant_id", "status"],
    )
    op.create_index(
        "ix_attendance_excusal_session_student",
        "attendance_excusal_requests",
        ["session_id", "student_id"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_attendance_excusal_pending_session_student
        ON attendance_excusal_requests (session_id, student_id)
        WHERE status = 'pending'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_attendance_excusal_pending_session_student")
    op.drop_index("ix_attendance_excusal_session_student", table_name="attendance_excusal_requests")
    op.drop_index("ix_attendance_excusal_tenant_status", table_name="attendance_excusal_requests")
    op.drop_table("attendance_excusal_requests")
