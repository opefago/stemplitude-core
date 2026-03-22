"""Add classroom session events for chat and recognition.

Revision ID: 006_session_events
Revises: 005_session_presence
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "006_session_events"
down_revision: Union[str, None] = "005_session_presence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "classroom_session_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("classroom_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "classroom_id",
            UUID(as_uuid=True),
            sa.ForeignKey("classrooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("actor_type", sa.String(length=20), nullable=False),
        sa.Column("student_id", UUID(as_uuid=True), nullable=True),
        sa.Column("message", sa.String(length=2000), nullable=True),
        sa.Column("points_delta", sa.Integer(), nullable=True),
        sa.Column("metadata", JSONB, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_classroom_session_events_session_id", "classroom_session_events", ["session_id"])
    op.create_index("ix_classroom_session_events_classroom_id", "classroom_session_events", ["classroom_id"])
    op.create_index("ix_classroom_session_events_tenant_id", "classroom_session_events", ["tenant_id"])
    op.create_index("ix_classroom_session_events_event_type", "classroom_session_events", ["event_type"])
    op.create_index("ix_classroom_session_events_actor_id", "classroom_session_events", ["actor_id"])
    op.create_index("ix_classroom_session_events_student_id", "classroom_session_events", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_classroom_session_events_student_id", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_actor_id", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_event_type", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_tenant_id", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_classroom_id", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_session_id", table_name="classroom_session_events")
    op.drop_table("classroom_session_events")
