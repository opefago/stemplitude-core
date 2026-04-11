"""Session recordings metadata + governance.

Revision ID: 049_session_recordings_livekit
Revises: 048_rubric_assignment_templates
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "049_session_recordings_livekit"
down_revision: Union[str, None] = "048_rubric_assignment_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="livekit_cloud"),
        sa.Column("provider_room_name", sa.String(length=255), nullable=True),
        sa.Column("provider_recording_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="recording"),
        sa.Column("blob_key", sa.String(length=1024), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("retention_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["classroom_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_recordings_tenant_id"), "session_recordings", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_session_recordings_classroom_id"), "session_recordings", ["classroom_id"], unique=False)
    op.create_index(op.f("ix_session_recordings_session_id"), "session_recordings", ["session_id"], unique=False)
    op.create_index(op.f("ix_session_recordings_created_by_id"), "session_recordings", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_session_recordings_status"), "session_recordings", ["status"], unique=False)
    op.create_index(op.f("ix_session_recordings_provider_recording_id"), "session_recordings", ["provider_recording_id"], unique=False)
    op.create_index(op.f("ix_session_recordings_retention_expires_at"), "session_recordings", ["retention_expires_at"], unique=False)
    op.create_index(op.f("ix_session_recordings_deleted_at"), "session_recordings", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_session_recordings_deleted_at"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_retention_expires_at"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_provider_recording_id"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_status"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_created_by_id"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_session_id"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_classroom_id"), table_name="session_recordings")
    op.drop_index(op.f("ix_session_recordings_tenant_id"), table_name="session_recordings")
    op.drop_table("session_recordings")
