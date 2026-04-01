"""Batch-reconcile local subscriptions + licenses from Stripe for one tenant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.subscriptions.license_sync import sync_license_from_subscription
from app.subscriptions.models import Subscription
from app.subscriptions.stripe_client import retrieve_subscription
from app.subscriptions.stripe_subscription_sync import apply_stripe_subscription_payload_to_local


async def run_stripe_reconcile_for_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    *,
    max_items: int = 200,
) -> dict[str, int]:
    """For each recent Stripe-backed subscription on the tenant, retrieve Stripe and sync license.

    Returns counts: ``updated`` (Stripe retrieve succeeded), ``skipped`` (retrieve failed), ``total`` (candidates).
    """
    max_items = max(1, min(int(max_items), 1000))
    subs_result = await session.execute(
        select(Subscription)
        .where(
            Subscription.tenant_id == tenant_id,
            Subscription.stripe_subscription_id.is_not(None),
        )
        .order_by(Subscription.created_at.desc())
        .limit(max_items)
    )
    subs = list(subs_result.scalars().all())
    updated = 0
    skipped = 0
    for sub in subs:
        stripe_sub = retrieve_subscription(sub.stripe_subscription_id or "")
        if not stripe_sub:
            skipped += 1
            continue
        apply_stripe_subscription_payload_to_local(sub, stripe_sub)
        await session.flush()
        await sync_license_from_subscription(session, sub)
        updated += 1
    return {"updated": updated, "skipped": skipped, "total": len(subs)}
