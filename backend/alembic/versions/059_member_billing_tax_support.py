"""Add tax collection support for member billing.

Adds tenant-level tax toggle + default behavior, and per-product tax_behavior override.

Revision ID: 059_member_billing_tax_support
Revises: 058_rate_limit_custom_overrides
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "059_member_billing_tax_support"
down_revision: Union[str, None] = "058_rate_limit_custom_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("member_billing_tax_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "member_billing_tax_behavior_default",
            sa.String(length=20),
            nullable=False,
            server_default="exclusive",
        ),
    )
    op.add_column(
        "member_billing_products",
        sa.Column("tax_behavior", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("member_billing_products", "tax_behavior")
    op.drop_column("tenants", "member_billing_tax_behavior_default")
    op.drop_column("tenants", "member_billing_tax_enabled")
