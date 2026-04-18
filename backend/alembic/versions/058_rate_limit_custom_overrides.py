"""Add custom override fields to rate limit overrides.

Revision ID: 058_rate_limit_custom_overrides
Revises: 057_rate_limit_profile_overrides
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "058_rate_limit_custom_overrides"
down_revision: Union[str, None] = "057_rate_limit_profile_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rate_limit_profile_overrides",
        sa.Column("mode", sa.String(length=30), nullable=False, server_default="profile_only"),
    )
    op.add_column(
        "rate_limit_profile_overrides",
        sa.Column("custom_limit", sa.Integer(), nullable=True),
    )
    op.add_column(
        "rate_limit_profile_overrides",
        sa.Column("custom_window_seconds", sa.Integer(), nullable=True),
    )
    op.alter_column(
        "rate_limit_profile_overrides",
        "profile_key",
        existing_type=sa.String(length=80),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "rate_limit_profile_overrides",
        "profile_key",
        existing_type=sa.String(length=80),
        nullable=False,
    )
    op.drop_column("rate_limit_profile_overrides", "custom_window_seconds")
    op.drop_column("rate_limit_profile_overrides", "custom_limit")
    op.drop_column("rate_limit_profile_overrides", "mode")
