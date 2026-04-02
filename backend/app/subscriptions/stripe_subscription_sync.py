"""Apply Stripe Subscription payloads (SDK object or webhook JSON dict) to local ``Subscription`` rows."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.subscriptions.license_sync import sync_license_from_subscription
from app.subscriptions.models import Subscription
from app.subscriptions.stripe_client import (
    billing_period_unix_bounds_from_stripe_subscription,
    stripe_unix_to_aware_utc,
)


def _stripe_attr(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def apply_stripe_subscription_payload_to_local(subscription: Subscription, stripe_sub: Any) -> None:
    """Copy status, billing period, trial, and cancel timestamps from Stripe onto our row."""
    status = _stripe_attr(stripe_sub, "status")
    pause_collection = _stripe_attr(stripe_sub, "pause_collection")
    if pause_collection:
        subscription.status = "paused"
    elif status:
        subscription.status = str(status)
    cps_raw, cpe_raw = billing_period_unix_bounds_from_stripe_subscription(stripe_sub)
    subscription.current_period_start = stripe_unix_to_aware_utc(cps_raw)
    subscription.current_period_end = stripe_unix_to_aware_utc(cpe_raw)
    subscription.trial_end = stripe_unix_to_aware_utc(_stripe_attr(stripe_sub, "trial_end"))
    ca = stripe_unix_to_aware_utc(_stripe_attr(stripe_sub, "canceled_at"))
    if ca is not None:
        subscription.canceled_at = ca


async def sync_local_subscription_from_stripe_payload(
    db: AsyncSession,
    stripe_sub: Any,
) -> Subscription | None:
    """Find local subscription by Stripe id, apply payload, refresh license. Caller should commit."""
    from app.subscriptions.repository import SubscriptionRepository

    raw_id = _stripe_attr(stripe_sub, "id")
    if not raw_id:
        return None
    sid = str(raw_id).strip()
    if not sid:
        return None
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_stripe_id(sid)
    if not sub:
        return None
    apply_stripe_subscription_payload_to_local(sub, stripe_sub)
    await db.flush()
    await sync_license_from_subscription(db, sub)
    return sub
