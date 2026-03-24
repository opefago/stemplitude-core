"""Create promo and affiliate program tables.

Revision ID: 026_growth_promo_aff
Revises: 025_sub_webhook_harden
Create Date: 2026-03-23 07:45:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "026_growth_promo_aff"
down_revision: Union[str, None] = "025_sub_webhook_harden"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TABLE IF NOT EXISTS promo_codes (id UUID PRIMARY KEY)")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS tenant_id UUID")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS code VARCHAR(64)")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS name VARCHAR(120)")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'stripe'")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS discount_type VARCHAR(16) DEFAULT 'percent'")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2)")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS currency VARCHAR(8)")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_redemptions INTEGER")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS first_time_only BOOLEAN DEFAULT false")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS provider_mappings JSONB")
    op.execute("ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_promo_codes_tenant_id ON promo_codes (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_promo_codes_code ON promo_codes (code)")

    op.execute("CREATE TABLE IF NOT EXISTS promo_redemptions (id UUID PRIMARY KEY)")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS promo_code_id UUID")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS tenant_id UUID")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS user_id UUID")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS subscription_id UUID")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(120)")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS amount_cents INTEGER DEFAULT 0")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'usd'")
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_promo_redemptions_tenant_id ON promo_redemptions (tenant_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_promo_redemptions_subscription_id ON promo_redemptions (subscription_id)"
    )

    op.execute("CREATE TABLE IF NOT EXISTS affiliate_partners (id UUID PRIMARY KEY)")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS tenant_id UUID")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS name VARCHAR(120)")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS code VARCHAR(64)")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active'")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS payout_email VARCHAR(255)")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS commission_type VARCHAR(16) DEFAULT 'percent'")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS commission_value NUMERIC(10, 2)")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS commission_mode VARCHAR(16) DEFAULT 'one_time'")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS commission_window_days INTEGER DEFAULT 365")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS max_commission_cycles INTEGER DEFAULT 1")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS attribution_model VARCHAR(16) DEFAULT 'last_touch'")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS payout_hold_days INTEGER DEFAULT 30")
    op.execute("ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_affiliate_partners_tenant_id ON affiliate_partners (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_affiliate_partners_code ON affiliate_partners (code)")

    op.execute("CREATE TABLE IF NOT EXISTS affiliate_conversions (id UUID PRIMARY KEY)")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS affiliate_partner_id UUID")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS tenant_id UUID")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS user_id UUID")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS subscription_id UUID")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(120)")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS commission_cycle_number INTEGER DEFAULT 1")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS skipped_reason VARCHAR(128)")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS attribution_start_at TIMESTAMPTZ")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS attribution_end_at TIMESTAMPTZ")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_affiliate_conversions_tenant_id ON affiliate_conversions (tenant_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_affiliate_conversions_subscription_id ON affiliate_conversions (subscription_id)"
    )

    op.execute("CREATE TABLE IF NOT EXISTS affiliate_commissions (id UUID PRIMARY KEY)")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS affiliate_partner_id UUID")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS conversion_invoice_id VARCHAR(120)")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS amount_cents INTEGER")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'usd'")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'accrued'")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS is_payable BOOLEAN DEFAULT true")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS non_payable_reason VARCHAR(128)")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_affiliate_commissions_status ON affiliate_commissions (status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_affiliate_commissions_available_at ON affiliate_commissions (available_at)"
    )


def downgrade() -> None:
    # Safe no-op downgrade to avoid dropping pre-existing shared tables.
    pass

