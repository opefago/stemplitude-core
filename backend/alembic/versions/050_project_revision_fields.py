"""Project revision + save lineage fields.

Revision ID: 050_project_revision_fields
Revises: 049_session_recordings_livekit
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "050_project_revision_fields"
down_revision: Union[str, None] = "049_session_recordings_livekit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("save_kind", sa.String(length=20), nullable=False, server_default="checkpoint"),
    )
    op.add_column(
        "projects",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "projects",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "projects",
        sa.Column("source_project_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_projects_source_project_id_projects",
        "projects",
        "projects",
        ["source_project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_projects_source_project_id"),
        "projects",
        ["source_project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_projects_source_project_id"), table_name="projects")
    op.drop_constraint("fk_projects_source_project_id_projects", "projects", type_="foreignkey")
    op.drop_column("projects", "source_project_id")
    op.drop_column("projects", "updated_at")
    op.drop_column("projects", "revision")
    op.drop_column("projects", "save_kind")
