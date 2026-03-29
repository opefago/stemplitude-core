"""End local trial subscriptions when a paid Stripe subscription is activated."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.subscriptions.license_sync import sync_license_from_subscription
from app.subscriptions.models import Subscription


async def cancel_local_trial_subscriptions_for_tenant(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    exclude_subscription_id: UUID | None = None,
) -> int:
    """Mark provider=trial rows canceled and refresh their licenses (inactive). Returns count updated."""
    q = select(Subscription).where(
        Subscription.tenant_id == tenant_id,
        Subscription.provider == "trial",
        Subscription.status.in_(("trialing", "active")),
    )
    if exclude_subscription_id:
        q = q.where(Subscription.id != exclude_subscription_id)
    result = await db.execute(q)
    rows = list(result.scalars().all())
    n = 0
    for sub in rows:
        sub.status = "canceled"
        n += 1
        await sync_license_from_subscription(db, sub)
    if n:
        await db.flush()
    return n
