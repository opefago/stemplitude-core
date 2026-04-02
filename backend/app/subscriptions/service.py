"""Subscription service."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.dependencies import CurrentIdentity, TenantContext
from app.growth.router import validate_promo_for_checkout
from app.plans.repository import PlanRepository
from app.plans.stripe_checkout import subscription_checkout_line_item
from app.users.repository import UserRepository

from .billing_provider import BillingCheckoutError, get_billing_provider
from .provider_catalog import validate_checkout_provider
from .schemas import CheckoutRequest, CheckoutResponse, InvoiceResponse, SubscriptionResponse
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
    ) -> tuple[CheckoutResponse | None, str | None, int | None]:
        """Create a hosted checkout session for the selected billing provider.

        Returns ``(response, error_detail, http_status)``. On success, error fields are None.
        """
        provider_key = (data.payment_provider or "stripe").strip().lower()
        err, code = validate_checkout_provider(provider_key)
        if err:
            return None, err, code

        impl = get_billing_provider(provider_key)
        if not impl:
            return None, f"Payment provider '{provider_key}' is not supported.", 400

        plan = await self.plan_repo.get_by_id(data.plan_id)
        if not plan:
            logger.warning("Checkout failed: plan not found plan_id=%s", data.plan_id)
            return None, "Subscription plan not found.", 400

        line_item, line_error = subscription_checkout_line_item(
            plan,
            billing_cycle=data.billing_cycle,
        )
        if not line_item:
            logger.warning(
                "Checkout failed: no line item provider=%s plan=%s cycle=%s",
                provider_key,
                data.plan_id,
                data.billing_cycle,
            )
            return None, line_error or "No payment catalog price is configured for this plan.", 400

        user = await self.user_repo.get_by_id(identity.id)
        if not user or not user.email:
            return None, "Your account must have an email address to start checkout.", 400

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
                reason = promo_validation.get("reason") or "This promo code is not valid."
                return None, str(reason), 400

        checkout_metadata = {}
        if promo_code:
            checkout_metadata["promo_code"] = promo_code
        if affiliate_code:
            checkout_metadata["affiliate_code"] = affiliate_code

        try:
            # Trial is provisioned at signup (cardless); Stripe checkout starts paid billing immediately.
            billing_session = impl.create_checkout_session(
                tenant_id=tenant_ctx.tenant_id,
                user_id=identity.id,
                user_email=user.email,
                plan_id=data.plan_id,
                success_url=data.success_url,
                cancel_url=data.cancel_url,
                billing_cycle=data.billing_cycle,
                line_item=line_item,
                trial_days=0,
                metadata=checkout_metadata or None,
            )
        except BillingCheckoutError as exc:
            return None, str(exc), 502

        if not billing_session:
            return None, "Could not create a checkout session.", 500

        logger.info(
            "Checkout session created tenant=%s plan=%s cycle=%s provider=%s",
            tenant_ctx.tenant_id,
            data.plan_id,
            data.billing_cycle,
            provider_key,
        )
        return (
            CheckoutResponse(
                session_id=billing_session.session_id,
                url=billing_session.url,
                payment_provider=billing_session.provider,
            ),
            None,
            None,
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

        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        prov_id = sub.provider_subscription_id or sub.stripe_subscription_id
        if not prov_id:
            return None

        impl = get_billing_provider(sub.provider or "stripe")
        if not impl:
            return None
        ok = impl.cancel_subscription(prov_id)
        if ok:
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
        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        prov_id = sub.provider_subscription_id or sub.stripe_subscription_id
        if not prov_id:
            return None

        impl = get_billing_provider(sub.provider or "stripe")
        if not impl:
            return None
        ok = impl.reactivate_subscription(prov_id)
        if ok:
            logger.info("Subscription reactivated id=%s tenant=%s", subscription_id, tenant_ctx.tenant_id)
            sub.canceled_at = None
            await self.session.flush()
            await self.session.refresh(sub)

        return SubscriptionResponse.model_validate(sub)

    async def pause_subscription(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> SubscriptionResponse | None:
        """Pause subscription billing collection."""
        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        prov_id = sub.provider_subscription_id or sub.stripe_subscription_id
        if not prov_id:
            return None

        impl = get_billing_provider(sub.provider or "stripe")
        if not impl:
            return None
        ok = impl.pause_subscription(prov_id)
        if ok:
            logger.info("Subscription paused id=%s tenant=%s", subscription_id, tenant_ctx.tenant_id)
            sub.status = "paused"
            await self.session.flush()
            await self.session.refresh(sub)

        return SubscriptionResponse.model_validate(sub)

    async def resume_subscription(
        self,
        subscription_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> SubscriptionResponse | None:
        """Resume billing collection for a paused subscription."""
        sub = await self.repo.get_by_id(subscription_id)
        if not sub or sub.tenant_id != tenant_ctx.tenant_id:
            logger.warning("Subscription not found id=%s", subscription_id)
            return None
        prov_id = sub.provider_subscription_id or sub.stripe_subscription_id
        if not prov_id:
            return None

        impl = get_billing_provider(sub.provider or "stripe")
        if not impl:
            return None
        ok = impl.resume_subscription(prov_id)
        if ok:
            logger.info("Subscription resumed id=%s tenant=%s", subscription_id, tenant_ctx.tenant_id)
            if (sub.status or "").lower() == "paused":
                sub.status = "active"
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

    async def list_invoices_for_tenant(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[InvoiceResponse], int]:
        """All invoices for the tenant (across every subscription)."""
        from app.subscriptions.stripe_invoice_sync import (
            backfill_paid_invoices_from_stripe_for_tenant,
        )

        await backfill_paid_invoices_from_stripe_for_tenant(
            self.session,
            tenant_ctx.tenant_id,
        )
        invoices, total = await self.repo.list_invoices_for_tenant(
            tenant_ctx.tenant_id, skip=skip, limit=limit
        )
        return [InvoiceResponse.model_validate(i) for i in invoices], total
