"""subscription webhook hardening

Revision ID: 025_sub_webhook_harden
Revises: 024_affiliate_policy_windows
Create Date: 2026-03-23 07:21:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "025_sub_webhook_harden"
down_revision: Union[str, None] = "024_affiliate_policy_windows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM subscriptions s
        USING (
          SELECT id
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY stripe_subscription_id
                     ORDER BY created_at DESC NULLS LAST, id DESC
                   ) AS rn
            FROM subscriptions
            WHERE stripe_subscription_id IS NOT NULL
          ) ranked
          WHERE ranked.rn > 1
        ) dups
        WHERE s.id = dups.id
        """
    )
    op.execute(
        """
        DELETE FROM invoices i
        USING (
          SELECT id
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY stripe_invoice_id
                     ORDER BY created_at DESC NULLS LAST, id DESC
                   ) AS rn
            FROM invoices
            WHERE stripe_invoice_id IS NOT NULL
          ) ranked
          WHERE ranked.rn > 1
        ) dups
        WHERE i.id = dups.id
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS billing_webhook_events (
            id UUID PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            event_id VARCHAR(128) NOT NULL,
            event_type VARCHAR(128) NOT NULL,
            processed_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_billing_webhook_provider_event'
          ) THEN
            ALTER TABLE billing_webhook_events
            ADD CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, event_id);
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
            WHERE conname = 'uq_subscriptions_stripe_subscription_id'
          ) THEN
            ALTER TABLE subscriptions
            ADD CONSTRAINT uq_subscriptions_stripe_subscription_id UNIQUE (stripe_subscription_id);
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
            WHERE conname = 'uq_invoices_stripe_invoice_id'
          ) THEN
            ALTER TABLE invoices
            ADD CONSTRAINT uq_invoices_stripe_invoice_id UNIQUE (stripe_invoice_id);
          END IF;
        END$$;
        """
    )


def downgrade() -> None:
    op.drop_constraint("uq_invoices_stripe_invoice_id", "invoices", type_="unique")
    op.drop_constraint("uq_subscriptions_stripe_subscription_id", "subscriptions", type_="unique")
    op.drop_table("billing_webhook_events")

