"""Subscription service."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.dependencies import CurrentIdentity, TenantContext
from app.growth.router import validate_promo_for_checkout
from app.plans.repository import PlanRepository
from app.users.repository import UserRepository

from .schemas import CheckoutRequest, CheckoutResponse, InvoiceResponse, SubscriptionResponse
from .stripe_client import create_checkout_session
from .repository import SubscriptionRepository


class SubscriptionService:
    """Subscription business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = SubscriptionRepository(session)
        self.plan_repo = PlanRepository(session)
        self.user_repo = UserRepository(session)

    async def create_checkout(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        data: CheckoutRequest,
    ) -> CheckoutResponse | None:
        """Create a Stripe checkout session."""
        plan = await self.plan_repo.get_by_id(data.plan_id)
        if not plan:
            logger.warning("Checkout failed: plan not found plan_id=%s", data.plan_id)
            return None

        price_id = (
            plan.stripe_price_id_yearly
            if data.billing_cycle == "yearly"
            else plan.stripe_price_id_monthly
        )
        if not price_id:
            logger.warning("Checkout failed: no price_id plan=%s cycle=%s", data.plan_id, data.billing_cycle)
            return None

        user = await self.user_repo.get_by_id(identity.id)
        if not user or not user.email:
            return None

        promo_code = (data.promo_code or "").strip().upper() or None
        affiliate_code = (data.affiliate_code or "").strip().upper() or None
        if promo_code:
            promo_validation = await validate_promo_for_checkout(
                db=self.session,
                tenant_id=str(tenant_ctx.tenant_id),
                code=promo_code,
                user_id=str(identity.id),
            )
            if not promo_validation.get("ok"):
                logger.warning(
                    "Checkout failed: invalid promo tenant=%s user=%s reason=%s",
                    tenant_ctx.tenant_id,
                    identity.id,
                    promo_validation.get("reason"),
                )
                return None

        checkout_metadata = {}
        if promo_code:
            checkout_metadata["promo_code"] = promo_code
        if affiliate_code:
            checkout_metadata["affiliate_code"] = affiliate_code

        session = create_checkout_session(
            tenant_id=tenant_ctx.tenant_id,
            user_id=identity.id,
            user_email=user.email,
            plan_id=data.plan_id,
            success_url=data.success_url,
            cancel_url=data.cancel_url,
            price_id=price_id,
            billing_cycle=data.billing_cycle,
            trial_days=plan.trial_days or 0,
            metadata=checkout_metadata or None,
        )
        if not session:
            return None

        logger.info("Checkout session created tenant=%s plan=%s cycle=%s", tenant_ctx.tenant_id, data.plan_id, data.billing_cycle)
        return CheckoutResponse(
            session_id=session.id,
            url=session.url,
        )

    async def get_subscription(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> SubscriptionResponse | None:
        """Get subscription by ID (tenant-scoped)."""
        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        return SubscriptionResponse.model_validate(sub)

    async def list_subscriptions(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[SubscriptionResponse], int]:
        """List subscriptions for the tenant."""
        subs, total = await self.repo.list_by_tenant(
            tenant_ctx.tenant_id, skip=skip, limit=limit
        )
        return [SubscriptionResponse.model_validate(s) for s in subs], total

    async def cancel_subscription(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> SubscriptionResponse | None:
        """Cancel subscription at period end."""
        from datetime import datetime, timezone

        from app.subscriptions.models import Subscription
        from .stripe_client import cancel_subscription as stripe_cancel

        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        if not sub.stripe_subscription_id:
            return None

        stripe_sub = stripe_cancel(sub.stripe_subscription_id)
        if stripe_sub:
            logger.info("Subscription canceled id=%s tenant=%s", subscription_id, tenant_ctx.tenant_id)
            sub.canceled_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self.session.refresh(sub)

        return SubscriptionResponse.model_validate(sub)

    async def reactivate_subscription(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> SubscriptionResponse | None:
        """Reactivate a subscription set to cancel."""
        from .stripe_client import reactivate_subscription as stripe_reactivate

        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        if not sub.stripe_subscription_id:
            return None

        stripe_sub = stripe_reactivate(sub.stripe_subscription_id)
        if stripe_sub:
            logger.info("Subscription reactivated id=%s tenant=%s", subscription_id, tenant_ctx.tenant_id)
            sub.canceled_at = None
            await self.session.flush()
            await self.session.refresh(sub)

        return SubscriptionResponse.model_validate(sub)

    async def list_invoices(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[InvoiceResponse], int]:
        """List invoices for a subscription (tenant-scoped)."""
        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            return [], 0

        invoices, total = await self.repo.list_invoices(
            subscription_id, skip=skip, limit=limit
        )
        return [InvoiceResponse.model_validate(i) for i in invoices], total
