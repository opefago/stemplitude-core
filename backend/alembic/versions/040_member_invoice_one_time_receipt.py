"""Member billing: link invoices to one-time purchases + payment intent id for receipt webhooks.

Revision ID: 040_member_inv_purchase
Revises: 039_platform_mb_fee_defaults
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "040_member_inv_purchase"
down_revision: Union[str, None] = "039_platform_mb_fee_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "member_purchases",
        sa.Column("stripe_payment_intent_id", sa.String(120), nullable=True),
    )
    op.create_index(
        "ix_member_purchases_stripe_payment_intent_id",
        "member_purchases",
        ["stripe_payment_intent_id"],
        unique=True,
    )

    op.add_column(
        "member_invoices",
        sa.Column(
            "member_purchase_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("member_purchases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "uq_member_invoices_member_purchase_id",
        "member_invoices",
        ["member_purchase_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_member_invoices_member_purchase_id", table_name="member_invoices")
    op.drop_column("member_invoices", "member_purchase_id")

    op.drop_index("ix_member_purchases_stripe_payment_intent_id", table_name="member_purchases")
    op.drop_column("member_purchases", "stripe_payment_intent_id")
