"""Add lab_type column to classroom_session_presence table.

Revision ID: 019_presence_lab_type
Revises: 018_presence_in_lab
Create Date: 2026-03-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "019_presence_lab_type"
down_revision: Union[str, None] = "018_presence_in_lab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "classroom_session_presence",
        sa.Column("lab_type", sa.String(length=60), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("classroom_session_presence", "lab_type")
