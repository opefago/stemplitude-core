"""Add quiz foundation and lesson quiz links.

Revision ID: 053_quiz_foundation
Revises: 052_lesson_class_assignments
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "053_quiz_foundation"
down_revision: Union[str, None] = "052_lesson_class_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quizzes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("owner_type", sa.String(length=20), nullable=False, server_default="tenant"),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default="tenant_only"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_quizzes_tenant_id"), "quizzes", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_quizzes_visibility"), "quizzes", ["visibility"], unique=False)
    op.create_index(op.f("ix_quizzes_status"), "quizzes", ["status"], unique=False)
    op.create_index(op.f("ix_quizzes_created_by_id"), "quizzes", ["created_by_id"], unique=False)

    op.create_table(
        "lesson_quiz_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quiz_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id", "quiz_id", name="uq_lesson_quiz"),
    )
    op.create_index(op.f("ix_lesson_quiz_links_lesson_id"), "lesson_quiz_links", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_lesson_quiz_links_quiz_id"), "lesson_quiz_links", ["quiz_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lesson_quiz_links_quiz_id"), table_name="lesson_quiz_links")
    op.drop_index(op.f("ix_lesson_quiz_links_lesson_id"), table_name="lesson_quiz_links")
    op.drop_table("lesson_quiz_links")

    op.drop_index(op.f("ix_quizzes_created_by_id"), table_name="quizzes")
    op.drop_index(op.f("ix_quizzes_status"), table_name="quizzes")
    op.drop_index(op.f("ix_quizzes_visibility"), table_name="quizzes")
    op.drop_index(op.f("ix_quizzes_tenant_id"), table_name="quizzes")
    op.drop_table("quizzes")
