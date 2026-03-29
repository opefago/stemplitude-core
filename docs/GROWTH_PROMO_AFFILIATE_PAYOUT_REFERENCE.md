# Growth Promo Affiliate Payout Reference

## Purpose

This guide documents the operational model for promo codes, affiliates, and payout workflows in Steamplitude.

## Core entities

- **PromoCode**: Defines discount policy and validity rules.
- **PromoRedemption**: One redemption instance tied to subscription/invoice.
- **AffiliatePartner**: Partner profile + commission policy.
- **AffiliateConversion**: Attributed paid conversion event.
- **AffiliateCommission**: Ledger entry for payable amount.
- **BillingWebhookEvent**: Idempotency record for billing webhooks.

## Promo model

- `code`: unique customer-facing code
- `name`: campaign label
- `discount_type`: `percent` or `fixed`
- `discount_value`: numeric value applied based on type
- `starts_at`, `ends_at`: validity window
- `max_redemptions`: global cap
- `per_customer_limit`: per-customer cap
- `first_time_only`: restrict to first purchase
- `provider_mappings`: provider-neutral references
  - `provider_coupon_ref`
  - `provider_promo_ref`

## Affiliate policy model

- `commission_type`: `percent` or `fixed`
- `commission_value`: payout value
- `commission_mode`: `one_time` or `recurring`
- `commission_window_days`: attribution horizon in days
- `max_commission_cycles`: max billable cycles for recurring attribution
- `attribution_model`: `first_touch` or `last_touch`
- `payout_hold_days`: hold before becoming payout-eligible

## Webhook flow

1. Checkout completes -> subscription linked with promo + affiliate context.
2. Invoice paid webhook arrives.
3. Promo redemption is recorded.
4. Affiliate conversion is recorded.
5. Commission is generated with `available_at` = `created_at + payout_hold_days`.
6. Idempotency table prevents duplicate processing.

## Payout workflow

1. Review commissions in Growth Ops.
2. Export payout-ready rows via `reports/payouts.csv`.
3. Pay externally (bank, Stripe Connect, or provider tooling).
4. Mark as paid in Growth Ops for reconciliation.

## Commission statuses

- `accrued`: created after paid invoice, waiting for hold window to mature
- `available`: payout-eligible after hold window
- `pending`: optional manual review hold
- `approved`: accepted for payout queue
- `paid`: payout settled
- `reversed`: clawback/chargeback adjustment

## UI mapping

- Growth Ops page: `/app/platform/growth`
- Help page: `/app/platform/growth/help`
- Exports:
  - `/api/v1/growth/reports/commissions.csv`
  - `/api/v1/growth/reports/payouts.csv`

## Input constraints

- Numeric fields enforce `type=number` with `min`/`step`.
- Email fields enforce `type=email`.
- Required fields are blocked client-side before submit.
- Start/end datetime validates `end > start`.

## Operations checklist

- Create promo with explicit expiration and limits.
- Create affiliate with commission policy and hold days.
- Validate promo at checkout before session creation.
- Verify webhook processing and idempotency rows.
- Export payout file and reconcile paid marks weekly.

## Current implementation note

- Growth persistence is database-backed (promo/affiliate/redemption/conversion/commission tables), with webhook idempotency tracked in `billing_webhook_events`.
