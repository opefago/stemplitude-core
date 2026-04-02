"""Rubric templates, assignment templates, session display title.

Revision ID: 048_rubric_assignment_templates
Revises: 047_analytics_grades
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "048_rubric_assignment_templates"
down_revision: Union[str, None] = "047_analytics_grades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rubric_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column(
            "criteria",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rubric_templates_tenant_id"), "rubric_templates", ["tenant_id"], unique=False)

    op.create_table(
        "assignment_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("lab_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rubric_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("use_rubric", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("requires_lab", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("requires_assets", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("allow_edit_after_submit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rubric_template_id"], ["rubric_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assignment_templates_tenant_id"), "assignment_templates", ["tenant_id"], unique=False
    )
    op.create_index(
        op.f("ix_assignment_templates_course_id"), "assignment_templates", ["course_id"], unique=False
    )
    op.create_index(
        op.f("ix_assignment_templates_lesson_id"), "assignment_templates", ["lesson_id"], unique=False
    )

    op.add_column(
        "classroom_sessions",
        sa.Column("display_title", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("classroom_sessions", "display_title")
    op.drop_index(op.f("ix_assignment_templates_lesson_id"), table_name="assignment_templates")
    op.drop_index(op.f("ix_assignment_templates_course_id"), table_name="assignment_templates")
    op.drop_index(op.f("ix_assignment_templates_tenant_id"), table_name="assignment_templates")
    op.drop_table("assignment_templates")
    op.drop_index(op.f("ix_rubric_templates_tenant_id"), table_name="rubric_templates")
    op.drop_table("rubric_templates")
