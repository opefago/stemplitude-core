"""Add curriculum assignment source and template list.

Revision ID: 055_curriculum_assignment_policy
Revises: 054_quiz_versions
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "055_curriculum_assignment_policy"
down_revision: Union[str, None] = "054_quiz_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column(
            "classroom_assignment_source",
            sa.String(length=24),
            nullable=False,
            server_default="curriculum",
        ),
    )
    op.add_column(
        "courses",
        sa.Column(
            "assignment_template_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("courses", "assignment_template_ids")
    op.drop_column("courses", "classroom_assignment_source")
