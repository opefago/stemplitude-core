"""Add yjs_rooms persistence table.

Revision ID: 020_yjs_rooms
Revises: 019_presence_lab_type
Create Date: 2026-03-22
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_yjs_rooms"
down_revision: Union[str, None] = "019_presence_lab_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "yjs_rooms",
        sa.Column("room_name", sa.String(length=255), nullable=False),
        sa.Column("encoded_state", sa.LargeBinary, nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("room_name"),
    )


def downgrade() -> None:
    op.drop_table("yjs_rooms")
