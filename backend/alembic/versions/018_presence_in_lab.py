"""Add in_lab column to classroom_session_presence table.

Revision ID: 018_presence_in_lab
Revises: 017_invitations
Create Date: 2026-03-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "018_presence_in_lab"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "classroom_session_presence",
        sa.Column("in_lab", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("classroom_session_presence", "in_lab")
