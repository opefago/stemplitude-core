"""Harden growth affiliate tables and tenant billing mode.

Revision ID: 028_growth_affiliate_hardening
Revises: 027_sub_provider_generic
Create Date: 2026-03-23 09:40:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "028_growth_affiliate_hardening"
down_revision: Union[str, None] = "027_sub_provider_generic"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- tenants: support live/test/internal billing mode ----
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(20)")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_email_enabled BOOLEAN")
    op.execute(
        """
        UPDATE tenants
        SET billing_mode = 'live'
        WHERE billing_mode IS NULL OR billing_mode = ''
        """
    )
    op.execute(
        """
        UPDATE tenants
        SET billing_email_enabled = TRUE
        WHERE billing_email_enabled IS NULL
        """
    )
    op.execute("ALTER TABLE tenants ALTER COLUMN billing_mode SET DEFAULT 'live'")
    op.execute("ALTER TABLE tenants ALTER COLUMN billing_mode SET NOT NULL")
    op.execute("ALTER TABLE tenants ALTER COLUMN billing_email_enabled SET DEFAULT TRUE")
    op.execute("ALTER TABLE tenants ALTER COLUMN billing_email_enabled SET NOT NULL")

    # ---- growth references: keep user-level attribution in DB ----
    op.execute("ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS user_id UUID")
    op.execute("ALTER TABLE affiliate_conversions ADD COLUMN IF NOT EXISTS user_id UUID")

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_promo_redemptions_user_id
        ON promo_redemptions (user_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_affiliate_conversions_user_id
        ON affiliate_conversions (user_id)
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_promo_redemptions_user_id'
          ) THEN
            ALTER TABLE promo_redemptions
            ADD CONSTRAINT fk_promo_redemptions_user_id
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END$$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_affiliate_conversions_user_id'
          ) THEN
            ALTER TABLE affiliate_conversions
            ADD CONSTRAINT fk_affiliate_conversions_user_id
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
        END$$;
        """
    )

    # ---- growth indexing and tenant-scoped uniqueness ----
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_promo_codes_tenant_id_created_at
        ON promo_codes (tenant_id, created_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_affiliate_partners_tenant_id_created_at
        ON affiliate_partners (tenant_id, created_at DESC)
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_promo_codes_tenant_code'
          ) THEN
            ALTER TABLE promo_codes
            ADD CONSTRAINT uq_promo_codes_tenant_code
            UNIQUE (tenant_id, code);
          END IF;
        END$$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_affiliate_partners_tenant_code'
          ) THEN
            ALTER TABLE affiliate_partners
            ADD CONSTRAINT uq_affiliate_partners_tenant_code
            UNIQUE (tenant_id, code);
          END IF;
        END$$;
        """
    )

    # ---- payout semantics for internal billing mode ----
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS is_payable BOOLEAN")
    op.execute("ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS non_payable_reason VARCHAR(80)")
    op.execute(
        """
        UPDATE affiliate_commissions
        SET is_payable = TRUE
        WHERE is_payable IS NULL
        """
    )
    op.execute("ALTER TABLE affiliate_commissions ALTER COLUMN is_payable SET DEFAULT TRUE")
    op.execute("ALTER TABLE affiliate_commissions ALTER COLUMN is_payable SET NOT NULL")


def downgrade() -> None:
    # Keep downgrade safe/no-op in mixed environments.
    pass

