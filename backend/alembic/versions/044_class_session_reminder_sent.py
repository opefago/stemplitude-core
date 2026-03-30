"""class_session_reminder_sent dedupe for parent class reminders.

Revision ID: 044_class_session_reminder
Revises: 043_ps_guardian_controls
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "044_class_session_reminder"
down_revision: Union[str, None] = "043_ps_guardian_controls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "class_session_reminder_sent",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("offset_minutes", sa.Integer(), nullable=False),
        sa.Column("recipient_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_session_id"], ["classroom_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "classroom_session_id",
            "offset_minutes",
            "recipient_user_id",
            name="uq_class_session_reminder_recipient",
        ),
    )
    op.create_index(
        "ix_class_session_reminder_sent_tenant_id",
        "class_session_reminder_sent",
        ["tenant_id"],
    )
    op.create_index(
        "ix_class_session_reminder_sent_session_id",
        "class_session_reminder_sent",
        ["classroom_session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_class_session_reminder_sent_session_id", table_name="class_session_reminder_sent")
    op.drop_index("ix_class_session_reminder_sent_tenant_id", table_name="class_session_reminder_sent")
    op.drop_table("class_session_reminder_sent")
