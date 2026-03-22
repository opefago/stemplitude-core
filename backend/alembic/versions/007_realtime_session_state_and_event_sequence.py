"""Add realtime session state and event sequencing.

Revision ID: 007_realtime_session_state
Revises: 006_session_events
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "007_realtime_session_state"
down_revision: Union[str, None] = "006_session_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "classroom_session_events",
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "classroom_session_events",
        sa.Column("correlation_id", sa.String(length=100), nullable=True),
    )
    op.create_index(
        "ix_classroom_session_events_sequence",
        "classroom_session_events",
        ["sequence"],
    )
    op.create_index(
        "ix_classroom_session_events_correlation_id",
        "classroom_session_events",
        ["correlation_id"],
    )
    op.create_unique_constraint(
        "uq_classroom_session_events_session_sequence",
        "classroom_session_events",
        ["session_id", "sequence"],
    )
    op.alter_column(
        "classroom_session_events",
        "sequence",
        server_default=None,
    )

    op.create_table(
        "classroom_session_state",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("classroom_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
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
        sa.Column("active_lab", sa.String(length=100), nullable=True),
        sa.Column("assignments", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", JSONB, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_classroom_session_state_session_id", "classroom_session_state", ["session_id"])
    op.create_index("ix_classroom_session_state_classroom_id", "classroom_session_state", ["classroom_id"])
    op.create_index("ix_classroom_session_state_tenant_id", "classroom_session_state", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_classroom_session_state_tenant_id", table_name="classroom_session_state")
    op.drop_index("ix_classroom_session_state_classroom_id", table_name="classroom_session_state")
    op.drop_index("ix_classroom_session_state_session_id", table_name="classroom_session_state")
    op.drop_table("classroom_session_state")

    op.drop_constraint(
        "uq_classroom_session_events_session_sequence",
        "classroom_session_events",
        type_="unique",
    )
    op.drop_index("ix_classroom_session_events_correlation_id", table_name="classroom_session_events")
    op.drop_index("ix_classroom_session_events_sequence", table_name="classroom_session_events")
    op.drop_column("classroom_session_events", "correlation_id")
    op.drop_column("classroom_session_events", "sequence")
