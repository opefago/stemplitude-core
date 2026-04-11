"""Subscription repository."""

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.subscriptions.models import Invoice, Subscription


class SubscriptionRepository:
    """Repository for subscription queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, subscription_id: UUID) -> Subscription | None:
        """Get subscription by ID."""
        result = await self.session.execute(
            select(Subscription).where(Subscription.id == subscription_id)
        )
        return result.scalar_one_or_none()

    async def get_by_stripe_id(self, stripe_subscription_id: str) -> Subscription | None:
        """Get subscription by Stripe subscription ID (legacy or provider column)."""
        result = await self.session.execute(
            select(Subscription).where(
                or_(
                    Subscription.stripe_subscription_id == stripe_subscription_id,
                    Subscription.provider_subscription_id == stripe_subscription_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Subscription], int]:
        """List subscriptions for a tenant."""
        count_result = await self.session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.tenant_id == tenant_id
            )
        )
        total = count_result.scalar() or 0

        result = await self.session.execute(
            select(Subscription)
            .where(Subscription.tenant_id == tenant_id)
            .order_by(Subscription.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        subs = list(result.scalars().all())
        return subs, total

    async def list_invoices(
        self,
        subscription_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Invoice], int]:
        """List invoices for a subscription."""
        count_result = await self.session.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.subscription_id == subscription_id
            )
        )
        total = count_result.scalar() or 0

        result = await self.session.execute(
            select(Invoice)
            .where(Invoice.subscription_id == subscription_id)
            .order_by(Invoice.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        invoices = list(result.scalars().all())
        return invoices, total

    async def list_invoices_for_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Invoice], int]:
        """All invoices for subscriptions belonging to this tenant."""
        tenant_filter = Subscription.tenant_id == tenant_id
        count_result = await self.session.execute(
            select(func.count())
            .select_from(Invoice)
            .join(Subscription, Invoice.subscription_id == Subscription.id)
            .where(tenant_filter)
        )
        total = int(count_result.scalar() or 0)
        result = await self.session.execute(
            select(Invoice)
            .join(Subscription, Invoice.subscription_id == Subscription.id)
            .where(tenant_filter)
            .order_by(func.coalesce(Invoice.paid_at, Invoice.created_at).desc())
            .offset(skip)
            .limit(limit)
        )
        invoices = list(result.scalars().all())
        return invoices, total

    async def get_invoice_by_stripe_id(self, stripe_invoice_id: str) -> Invoice | None:
        """Get invoice by Stripe invoice ID."""
        result = await self.session.execute(
            select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        )
        return result.scalar_one_or_none()
