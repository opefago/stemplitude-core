"""Platform default Stripe Connect member-billing application fee + tenant inherit flag.

Revision ID: 039_platform_mb_fee_defaults
Revises: 038_member_billing
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "039_platform_mb_fee_defaults"
down_revision: Union[str, None] = "038_member_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_stripe_billing_settings",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column(
            "member_billing_default_application_fee_bps",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        "INSERT INTO platform_stripe_billing_settings (id, member_billing_default_application_fee_bps) "
        "VALUES (1, 0)"
    )
    op.add_column(
        "tenants",
        sa.Column(
            "member_billing_application_fee_use_platform_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.alter_column(
        "tenants",
        "member_billing_application_fee_use_platform_default",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("tenants", "member_billing_application_fee_use_platform_default")
    op.drop_table("platform_stripe_billing_settings")
