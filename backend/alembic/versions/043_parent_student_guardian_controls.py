"""Parent_students: guardian messaging and publishing preferences.

Revision ID: 043_ps_guardian_controls (max 32 chars for alembic_version)
Revises: 042_hierarchy_governance_mode
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "043_ps_guardian_controls"
down_revision: Union[str, None] = "042_hierarchy_governance_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "parent_students",
        sa.Column(
            "messaging_scope",
            sa.String(32),
            nullable=False,
            server_default="classmates",
        ),
    )
    op.add_column(
        "parent_students",
        sa.Column(
            "allow_public_game_publishing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("parent_students", "allow_public_game_publishing")
    op.drop_column("parent_students", "messaging_scope")
