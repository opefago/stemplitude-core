"""Create local Invoice rows from Stripe invoice objects (webhooks + backfill)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.subscriptions.license_sync import sync_license_from_subscription
from app.subscriptions.models import Invoice
from app.subscriptions.repository import SubscriptionRepository
from app.subscriptions.stripe_checkout_fulfillment import (
    coerce_stripe_expandable_id,
    ensure_subscription_from_stripe_subscription_id,
)
from app.subscriptions.stripe_client import stripe_unix_to_aware_utc

logger = logging.getLogger(__name__)


def _inv_attr(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def stripe_invoice_subscription_id(stripe_invoice: Any) -> str | None:
    """Resolve subscription id from Invoice (webhook dict or StripeObject; handles parent.* shapes)."""
    sid = coerce_stripe_expandable_id(_inv_attr(stripe_invoice, "subscription"))
    if sid:
        return sid
    parent = _inv_attr(stripe_invoice, "parent")
    if parent is None:
        return None
    details = _inv_attr(parent, "subscription_details")
    if details is None:
        return None
    return coerce_stripe_expandable_id(_inv_attr(details, "subscription"))


def _normalize_affiliate_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().upper()
    return normalized or None


async def apply_paid_stripe_invoice(
    db: AsyncSession,
    stripe_invoice: Any,
    *,
    event_id: str,
    retrieve_subscription_fn: Callable[[str], Any | None],
    run_growth: bool,
) -> bool:
    """Upsert path for paid Stripe invoices. Returns True if a new local Invoice row was inserted."""
    subscription_id = stripe_invoice_subscription_id(stripe_invoice)
    if not subscription_id:
        logger.warning(
            "apply_paid_stripe_invoice: no subscription on invoice id=%s",
            _inv_attr(stripe_invoice, "id"),
        )
        return False

    stripe_invoice_id = _inv_attr(stripe_invoice, "id")
    if not stripe_invoice_id:
        return False

    repo = SubscriptionRepository(db)
    existing = await repo.get_invoice_by_stripe_id(stripe_invoice_id)
    if existing:
        sub = await repo.get_by_id(existing.subscription_id)
        if not sub:
            return False
        inv = existing
        created = False
    else:
        sub = await repo.get_by_stripe_id(subscription_id)
        if not sub:
            sub = await ensure_subscription_from_stripe_subscription_id(
                db,
                subscription_id,
                retrieve_subscription_fn=retrieve_subscription_fn,
            )
        if not sub:
            logger.warning(
                "apply_paid_stripe_invoice: no local subscription stripe_sub=%s inv=%s",
                subscription_id,
                stripe_invoice_id,
            )
            return False

        inv = Invoice(
            subscription_id=sub.id,
            provider="stripe",
            provider_invoice_id=stripe_invoice_id,
            stripe_invoice_id=stripe_invoice_id,
            amount_cents=_inv_attr(stripe_invoice, "amount_paid") or 0,
            currency=_inv_attr(stripe_invoice, "currency") or "usd",
            status="paid",
            period_start=stripe_unix_to_aware_utc(_inv_attr(stripe_invoice, "period_start")),
            period_end=stripe_unix_to_aware_utc(_inv_attr(stripe_invoice, "period_end")),
            paid_at=datetime.now(timezone.utc),
        )
        db.add(inv)
        await db.flush()
        created = True

    stripe_live = retrieve_subscription_fn(subscription_id)

    if run_growth:
        stripe_sub = stripe_live
        sub_metadata = getattr(stripe_sub, "metadata", None) if stripe_sub else None
        affiliate_code = None
        if isinstance(sub_metadata, dict):
            affiliate_code = _normalize_affiliate_code(sub_metadata.get("affiliate_code"))

        from app.growth.router import process_paid_invoice_for_growth

        try:
            async with db.begin_nested():
                await process_paid_invoice_for_growth(
                    db=db,
                    event_id=event_id,
                    tenant_id=str(sub.tenant_id),
                    user_id=str(sub.user_id),
                    subscription_id=str(sub.id),
                    invoice_id=stripe_invoice_id or str(inv.id),
                    amount_cents=inv.amount_cents,
                    currency=inv.currency,
                    promo_code=sub.promo_code,
                    affiliate_code=affiliate_code,
                    paid_at_iso=inv.paid_at.isoformat() if inv.paid_at else None,
                )
        except Exception:
            logger.exception(
                "apply_paid_stripe_invoice: growth failed (savepoint rolled back) stripe_inv=%s",
                stripe_invoice_id,
            )

    if stripe_live:
        from app.subscriptions.stripe_subscription_sync import apply_stripe_subscription_payload_to_local

        apply_stripe_subscription_payload_to_local(sub, stripe_live)
        await db.flush()

    await sync_license_from_subscription(db, sub)
    return created


async def backfill_paid_invoices_from_stripe_for_tenant(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    list_invoices_fn: Callable[..., Any | None] | None = None,
) -> int:
    """Pull paid Stripe invoices for tenant Stripe subscriptions; insert missing local rows. No growth."""
    from app.subscriptions.stripe_client import list_invoices_for_stripe_subscription

    list_fn = list_invoices_fn or list_invoices_for_stripe_subscription

    repo = SubscriptionRepository(db)
    subs, _ = await repo.list_by_tenant(tenant_id, skip=0, limit=200)
    added = 0
    for sub in subs:
        if (sub.provider or "").strip().lower() != "stripe":
            continue
        stripe_sub_id = (sub.stripe_subscription_id or sub.provider_subscription_id or "").strip()
        if not stripe_sub_id:
            continue
        listed = list_fn(stripe_sub_id, limit=50)
        rows = getattr(listed, "data", None) if listed else None
        if not rows:
            continue
        for inv in rows:
            if getattr(inv, "status", None) != "paid":
                continue
            inv_id = getattr(inv, "id", None)
            if not inv_id:
                continue
            inv_sub = stripe_invoice_subscription_id(inv)
            if inv_sub != stripe_sub_id:
                continue
            existing = await repo.get_invoice_by_stripe_id(inv_id)
            if existing:
                continue

            row = Invoice(
                subscription_id=sub.id,
                provider="stripe",
                provider_invoice_id=inv_id,
                stripe_invoice_id=inv_id,
                amount_cents=getattr(inv, "amount_paid", 0) or 0,
                currency=getattr(inv, "currency", "usd") or "usd",
                status="paid",
                period_start=stripe_unix_to_aware_utc(getattr(inv, "period_start", None)),
                period_end=stripe_unix_to_aware_utc(getattr(inv, "period_end", None)),
                paid_at=datetime.now(timezone.utc),
            )
            db.add(row)
            await db.flush()
            added += 1

    return added
