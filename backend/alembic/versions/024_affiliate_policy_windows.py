"""Placeholder for previously applied affiliate policy migration.

Revision ID: 024_affiliate_policy_windows
Revises: 021_classroom_program_settings
Create Date: 2026-03-23 07:20:00.000000
"""

from __future__ import annotations

from typing import Union

# NOTE:
# This migration intentionally contains no schema operations.
# It exists to restore a missing revision ID that is already present
# in some environments' alembic_version table.

revision: str = "024_affiliate_policy_windows"
down_revision: Union[str, None] = "021_classroom_program_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

