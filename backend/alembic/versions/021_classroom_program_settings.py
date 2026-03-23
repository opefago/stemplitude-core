"""Add settings JSONB column to programs and classrooms.

Revision ID: 021_classroom_program_settings
Revises: 020_yjs_rooms
Create Date: 2026-03-22
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "021_classroom_program_settings"
down_revision: Union[str, None] = "020_yjs_rooms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "programs",
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "classrooms",
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("classrooms", "settings")
    op.drop_column("programs", "settings")
