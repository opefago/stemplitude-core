"""Tenant hierarchy governance_mode (franchise curriculum/brand policy).

Revision ID: 042_hierarchy_governance_mode
Revises: 041_tenant_hosts_franchise
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "042_hierarchy_governance_mode"
down_revision: Union[str, None] = "041_tenant_hosts_franchise"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_hierarchy",
        sa.Column(
            "governance_mode",
            sa.String(32),
            nullable=False,
            server_default="child_managed",
        ),
    )
    op.create_index(
        "ix_tenant_hierarchy_governance_mode",
        "tenant_hierarchy",
        ["governance_mode"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_hierarchy_governance_mode", table_name="tenant_hierarchy")
    op.drop_column("tenant_hierarchy", "governance_mode")
