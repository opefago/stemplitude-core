"""Add updated_at to lesson_progress and lab_progress for streak activity.

Revision ID: 032_progress_updated_at
Revises: 031_gamif_student_fk
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "032_progress_updated_at"
down_revision: Union[str, None] = "031_gamif_student_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lesson_progress",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "lab_progress",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.execute(
        "UPDATE lesson_progress SET updated_at = completed_at WHERE completed_at IS NOT NULL"
    )
    op.execute(
        "UPDATE lab_progress SET updated_at = completed_at WHERE completed_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("lab_progress", "updated_at")
    op.drop_column("lesson_progress", "updated_at")
