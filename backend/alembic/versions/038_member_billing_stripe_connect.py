"""Member billing: Stripe Connect + tenant student/parent payments.

Revision ID: 038_member_billing
Revises: 037_suppr_scope_uniq
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "038_member_billing"
down_revision: Union[str, None] = "037_suppr_scope_uniq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("stripe_connect_account_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("member_billing_enabled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("require_member_billing_for_access", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("stripe_connect_charges_enabled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("stripe_connect_payouts_enabled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("stripe_connect_details_submitted", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("member_billing_application_fee_bps", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_tenants_stripe_connect_account_id", "tenants", ["stripe_connect_account_id"])

    op.create_table(
        "member_billing_products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="usd", nullable=False),
        sa.Column("billing_type", sa.String(20), nullable=False),
        sa.Column("interval", sa.String(20), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("stripe_product_id", sa.String(120), nullable=True),
        sa.Column("stripe_price_id", sa.String(120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # Index on tenant_id is already created by index=True on the column above.

    op.create_table(
        "member_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("member_billing_products.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "payer_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="incomplete"),
        sa.Column("stripe_customer_id", sa.String(120), nullable=True, index=True),
        sa.Column("stripe_subscription_id", sa.String(120), nullable=True, index=True),
        sa.Column("stripe_checkout_session_id", sa.String(120), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "stripe_subscription_id",
            name="uq_member_subscriptions_stripe_subscription_id",
        ),
    )
    op.create_index("ix_member_subscriptions_tenant_student", "member_subscriptions", ["tenant_id", "student_id"])

    op.create_table(
        "member_purchases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("member_billing_products.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "payer_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("stripe_checkout_session_id", sa.String(120), nullable=True, index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="usd", nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "member_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "member_subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("member_subscriptions.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("stripe_invoice_id", sa.String(120), nullable=True, index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="usd", nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("hosted_invoice_url", sa.String(2000), nullable=True),
        sa.Column("invoice_pdf", sa.String(2000), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("stripe_invoice_id", name="uq_member_invoices_stripe_invoice_id"),
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_member_sub_active_product
        ON member_subscriptions (tenant_id, student_id, product_id)
        WHERE status IN ('active', 'trialing', 'past_due', 'incomplete')
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_member_sub_active_product")
    op.drop_table("member_invoices")
    op.drop_table("member_purchases")
    op.drop_table("member_subscriptions")
    op.drop_table("member_billing_products")
    op.drop_index("ix_tenants_stripe_connect_account_id", table_name="tenants")
    op.drop_column("tenants", "member_billing_application_fee_bps")
    op.drop_column("tenants", "stripe_connect_details_submitted")
    op.drop_column("tenants", "stripe_connect_payouts_enabled")
    op.drop_column("tenants", "stripe_connect_charges_enabled")
    op.drop_column("tenants", "require_member_billing_for_access")
    op.drop_column("tenants", "member_billing_enabled")
    op.drop_column("tenants", "stripe_connect_account_id")
