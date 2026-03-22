"""Add curriculum default permitted lab launcher labels.

Revision ID: 010_curr_def_labs
Revises: 009_prog_curr_class_links
Create Date: 2026-03-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "010_curr_def_labs"
down_revision: Union[str, None] = "009_prog_curr_class_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("default_permitted_labs", JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("courses", "default_permitted_labs")
