"""Add start_pose JSONB column to robotics_worlds.

Creates the robotics_worlds table if it does not already exist (it was
defined in models but never migrated), including start_pose from the start.
If the table already exists, adds the column via ALTER TABLE.

Revision ID: 061_robotics_world_start_pose
Revises: 060_homepage_templates
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "061_robotics_world_start_pose"
down_revision: Union[str, None] = "060_homepage_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    table_exists = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables"
            "  WHERE table_name = 'robotics_worlds'"
            ")"
        )
    ).scalar()

    if not table_exists:
        op.create_table(
            "robotics_worlds",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("creator_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("world_scene", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("start_pose", postgresql.JSONB(), nullable=True),
            sa.Column("runtime_settings", postgresql.JSONB(), nullable=True),
            sa.Column("mission", postgresql.JSONB(), nullable=True),
            sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("share_code", sa.String(16), unique=True, nullable=True),
            sa.Column("visibility", sa.String(16), nullable=False, server_default=sa.text("'private'")),
            sa.Column("difficulty", sa.String(24), nullable=True),
            sa.Column("tags", postgresql.JSONB(), nullable=True),
            sa.Column("width_cells", sa.Integer(), nullable=False, server_default=sa.text("40")),
            sa.Column("height_cells", sa.Integer(), nullable=False, server_default=sa.text("24")),
            sa.Column("object_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("play_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_robotics_worlds_share_code", "robotics_worlds", ["share_code"], unique=True)
        op.create_index("ix_robotics_worlds_visibility", "robotics_worlds", ["visibility", "tenant_id"])
    else:
        has_column = conn.execute(
            sa.text(
                "SELECT EXISTS ("
                "  SELECT 1 FROM information_schema.columns"
                "  WHERE table_name = 'robotics_worlds' AND column_name = 'start_pose'"
                ")"
            )
        ).scalar()
        if not has_column:
            op.add_column("robotics_worlds", sa.Column("start_pose", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    table_exists = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables"
            "  WHERE table_name = 'robotics_worlds'"
            ")"
        )
    ).scalar()
    if table_exists:
        op.drop_column("robotics_worlds", "start_pose")
