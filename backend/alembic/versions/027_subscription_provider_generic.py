"""Make subscription billing provider-generic.

Revision ID: 027_sub_provider_generic
Revises: 026_growth_promo_aff
Create Date: 2026-03-23 08:25:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "027_sub_provider_generic"
down_revision: Union[str, None] = "026_growth_promo_aff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- subscriptions: generic provider fields ----
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider VARCHAR(32)")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(128)")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(128)")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_checkout_session_id VARCHAR(128)")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS affiliate_partner_id UUID")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(64)")

    op.execute(
        """
        UPDATE subscriptions
        SET provider = 'stripe'
        WHERE provider IS NULL OR provider = ''
        """
    )
    op.execute("ALTER TABLE subscriptions ALTER COLUMN provider SET DEFAULT 'stripe'")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN provider SET NOT NULL")

    op.execute(
        """
        UPDATE subscriptions
        SET provider_subscription_id = stripe_subscription_id
        WHERE provider_subscription_id IS NULL
          AND stripe_subscription_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE subscriptions
        SET provider_customer_id = stripe_customer_id
        WHERE provider_customer_id IS NULL
          AND stripe_customer_id IS NOT NULL
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_subscriptions_provider_subscription_id
        ON subscriptions (provider_subscription_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_subscriptions_provider_customer_id
        ON subscriptions (provider_customer_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_subscriptions_affiliate_partner_id
        ON subscriptions (affiliate_partner_id)
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_subscriptions_provider_subscription_id'
          ) THEN
            ALTER TABLE subscriptions
            ADD CONSTRAINT uq_subscriptions_provider_subscription_id
            UNIQUE (provider, provider_subscription_id);
          END IF;
        END$$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_subscriptions_affiliate_partner_id'
          ) THEN
            ALTER TABLE subscriptions
            ADD CONSTRAINT fk_subscriptions_affiliate_partner_id
            FOREIGN KEY (affiliate_partner_id)
            REFERENCES affiliate_partners(id)
            ON DELETE SET NULL;
          END IF;
        END$$;
        """
    )

    # ---- invoices: generic provider fields ----
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider VARCHAR(32)")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider_invoice_id VARCHAR(128)")

    op.execute(
        """
        UPDATE invoices
        SET provider = 'stripe'
        WHERE provider IS NULL OR provider = ''
        """
    )
    op.execute("ALTER TABLE invoices ALTER COLUMN provider SET DEFAULT 'stripe'")
    op.execute("ALTER TABLE invoices ALTER COLUMN provider SET NOT NULL")

    op.execute(
        """
        UPDATE invoices
        SET provider_invoice_id = stripe_invoice_id
        WHERE provider_invoice_id IS NULL
          AND stripe_invoice_id IS NOT NULL
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_invoices_provider_invoice_id
        ON invoices (provider_invoice_id)
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_invoices_provider_invoice_id'
          ) THEN
            ALTER TABLE invoices
            ADD CONSTRAINT uq_invoices_provider_invoice_id
            UNIQUE (provider, provider_invoice_id);
          END IF;
        END$$;
        """
    )

    # ---- webhook events payload for reconciliation/debugging ----
    op.execute("ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS payload JSONB")


def downgrade() -> None:
    # Keep downgrade safe/no-op in mixed environments.
    pass

