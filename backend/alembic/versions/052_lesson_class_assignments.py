"""Add classroom lesson assignments table.

Revision ID: 052_lesson_class_assignments
Revises: 051_track_lesson_sys
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "052_lesson_class_assignments"
down_revision: Union[str, None] = "051_track_lesson_sys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classroom_lesson_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("classroom_id", "lesson_id", name="uq_classroom_lesson"),
    )
    op.create_index(
        op.f("ix_classroom_lesson_assignments_tenant_id"),
        "classroom_lesson_assignments",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_classroom_lesson_assignments_classroom_id"),
        "classroom_lesson_assignments",
        ["classroom_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_classroom_lesson_assignments_lesson_id"),
        "classroom_lesson_assignments",
        ["lesson_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_classroom_lesson_assignments_assigned_by_id"),
        "classroom_lesson_assignments",
        ["assigned_by_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_classroom_lesson_assignments_assigned_by_id"), table_name="classroom_lesson_assignments")
    op.drop_index(op.f("ix_classroom_lesson_assignments_lesson_id"), table_name="classroom_lesson_assignments")
    op.drop_index(op.f("ix_classroom_lesson_assignments_classroom_id"), table_name="classroom_lesson_assignments")
    op.drop_index(op.f("ix_classroom_lesson_assignments_tenant_id"), table_name="classroom_lesson_assignments")
    op.drop_table("classroom_lesson_assignments")
