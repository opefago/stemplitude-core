"""Add classroom session presence tracking table.

Revision ID: 005_session_presence
Revises: 004_command_audit_log
Create Date: 2026-03-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "005_session_presence"
down_revision: Union[str, None] = "004_command_audit_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "classroom_session_presence",
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
        sa.Column("actor_id", UUID(as_uuid=True), nullable=False),
        sa.Column("actor_type", sa.String(length=20), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_classroom_session_presence_session_id", "classroom_session_presence", ["session_id"])
    op.create_index("ix_classroom_session_presence_classroom_id", "classroom_session_presence", ["classroom_id"])
    op.create_index("ix_classroom_session_presence_tenant_id", "classroom_session_presence", ["tenant_id"])
    op.create_index("ix_classroom_session_presence_actor_id", "classroom_session_presence", ["actor_id"])


def downgrade() -> None:
    op.drop_index("ix_classroom_session_presence_actor_id", table_name="classroom_session_presence")
    op.drop_index("ix_classroom_session_presence_tenant_id", table_name="classroom_session_presence")
    op.drop_index("ix_classroom_session_presence_classroom_id", table_name="classroom_session_presence")
    op.drop_index("ix_classroom_session_presence_session_id", table_name="classroom_session_presence")
    op.drop_table("classroom_session_presence")
