"""Add quiz versions table.

Revision ID: 054_quiz_versions
Revises: 053_quiz_foundation
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
import uuid

revision: str = "054_quiz_versions"
down_revision: Union[str, None] = "053_quiz_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quiz_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quiz_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quiz_id", "version", name="uq_quiz_version"),
    )
    op.create_index(op.f("ix_quiz_versions_quiz_id"), "quiz_versions", ["quiz_id"], unique=False)
    op.create_index(op.f("ix_quiz_versions_created_by_id"), "quiz_versions", ["created_by_id"], unique=False)
    bind = op.get_bind()
    quizzes = bind.execute(
        sa.text(
            """
            SELECT id, title, description, instructions, status, schema_json, created_by_id, created_at
            FROM quizzes
            """
        )
    ).mappings().all()
    for quiz in quizzes:
        bind.execute(
            sa.text(
                """
                INSERT INTO quiz_versions (
                    id,
                    quiz_id,
                    version,
                    title,
                    description,
                    instructions,
                    status,
                    schema_json,
                    created_by_id,
                    created_at
                ) VALUES (
                    :id,
                    :quiz_id,
                    1,
                    :title,
                    :description,
                    :instructions,
                    :status,
                    :schema_json,
                    :created_by_id,
                    :created_at
                )
                """
            ),
            {
                "id": uuid.uuid4(),
                "quiz_id": quiz["id"],
                "title": quiz["title"],
                "description": quiz["description"],
                "instructions": quiz["instructions"],
                "status": quiz["status"],
                "schema_json": quiz["schema_json"] or {},
                "created_by_id": quiz["created_by_id"],
                "created_at": quiz["created_at"],
            },
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_quiz_versions_created_by_id"), table_name="quiz_versions")
    op.drop_index(op.f("ix_quiz_versions_quiz_id"), table_name="quiz_versions")
    op.drop_table("quiz_versions")
