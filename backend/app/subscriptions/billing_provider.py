"""Billing provider abstraction — register implementations in _REGISTRY below."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Callable, Protocol
from uuid import UUID

import stripe

from app.config import settings

from .stripe_client import (
    cancel_subscription as stripe_cancel_subscription,
    construct_webhook_event as stripe_construct_webhook_event,
    create_checkout_session as stripe_create_checkout_session,
    reactivate_subscription as stripe_reactivate_subscription,
)

if TYPE_CHECKING:
    from app.plans.models import Plan

logger = logging.getLogger(__name__)


class BillingCheckoutError(Exception):
    """Raised when a provider cannot create a checkout session (caller maps to HTTP)."""


@dataclass
class BillingCheckoutSession:
    session_id: str
    url: str | None
    provider: str


@dataclass
class BillingWebhookPayload:
    provider: str
    type: str
    payload: dict


class BillingProvider(Protocol):
    provider_key: str

    def resolve_subscription_price_id(
        self,
        plan: Plan,
        *,
        billing_cycle: str,
    ) -> tuple[str | None, str | None]:
        """Return (price_or_catalog_id, user_visible_error_if_missing)."""

    def create_checkout_session(
        self,
        *,
        tenant_id: UUID,
        user_id: UUID,
        user_email: str,
        plan_id: UUID,
        success_url: str,
        cancel_url: str,
        billing_cycle: str,
        price_id: str,
        trial_days: int,
        metadata: dict | None,
    ) -> BillingCheckoutSession | None: ...

    def cancel_subscription(self, provider_subscription_id: str) -> bool: ...

    def reactivate_subscription(self, provider_subscription_id: str) -> bool: ...

    def parse_webhook(
        self,
        *,
        body: bytes,
        signature: str | None,
    ) -> BillingWebhookPayload | None: ...


class StripeBillingProvider:
    provider_key = "stripe"

    def resolve_subscription_price_id(
        self,
        plan: Plan,
        *,
        billing_cycle: str,
    ) -> tuple[str | None, str | None]:
        from app.plans.stripe_checkout import effective_stripe_price_id

        price_id = effective_stripe_price_id(plan, billing_cycle=billing_cycle)
        if price_id:
            return price_id, None
        return (
            None,
            "This plan has no Stripe Price ID for the selected billing cycle. "
            "Set stripe_price_id_monthly / stripe_price_id_yearly on the plan (database or "
            "backend/config/plan_registry.json), run the DB seed sync, or in development set "
            "STRIPE_DEV_FALLBACK_PRICE_MONTHLY / STRIPE_DEV_FALLBACK_PRICE_YEARLY in .env.",
        )

    def create_checkout_session(
        self,
        *,
        tenant_id: UUID,
        user_id: UUID,
        user_email: str,
        plan_id: UUID,
        success_url: str,
        cancel_url: str,
        billing_cycle: str,
        price_id: str,
        trial_days: int,
        metadata: dict | None,
    ) -> BillingCheckoutSession | None:
        try:
            session = stripe_create_checkout_session(
                tenant_id=tenant_id,
                user_id=user_id,
                user_email=user_email,
                plan_id=plan_id,
                success_url=success_url,
                cancel_url=cancel_url,
                price_id=price_id,
                billing_cycle=billing_cycle,
                trial_days=trial_days,
                metadata=metadata,
            )
        except stripe.StripeError as exc:
            msg = getattr(exc, "user_message", None) or str(exc) or "Stripe rejected the checkout request."
            logger.warning("Stripe checkout API error tenant=%s: %s", tenant_id, msg)
            raise BillingCheckoutError(
                "Payment provider could not start checkout. Check catalog price IDs and logs."
            ) from exc
        if not session:
            return None
        return BillingCheckoutSession(
            session_id=session.id,
            url=session.url,
            provider=self.provider_key,
        )

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        result = stripe_cancel_subscription(provider_subscription_id)
        return result is not None

    def reactivate_subscription(self, provider_subscription_id: str) -> bool:
        result = stripe_reactivate_subscription(provider_subscription_id)
        return result is not None

    def parse_webhook(
        self,
        *,
        body: bytes,
        signature: str | None,
    ) -> BillingWebhookPayload | None:
        if not signature:
            return None
        event = stripe_construct_webhook_event(body, signature)
        if not event:
            return None
        return BillingWebhookPayload(
            provider=self.provider_key,
            type=event.type,
            payload=event.data.object,
        )


class PayPalBillingProvider:
    """Placeholder — register in _REGISTRY and enable in billing_provider_registry.json when ready."""

    provider_key = "paypal"

    def resolve_subscription_price_id(
        self,
        plan: Plan,
        *,
        billing_cycle: str,
    ) -> tuple[str | None, str | None]:
        return (
            None,
            "PayPal subscription catalog IDs are not configured for this plan yet.",
        )

    def create_checkout_session(
        self,
        *,
        tenant_id: UUID,
        user_id: UUID,
        user_email: str,
        plan_id: UUID,
        success_url: str,
        cancel_url: str,
        billing_cycle: str,
        price_id: str,
        trial_days: int,
        metadata: dict | None,
    ) -> BillingCheckoutSession | None:
        logger.info(
            "PayPal checkout not implemented tenant=%s plan=%s",
            tenant_id,
            plan_id,
        )
        return None

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        logger.warning("PayPal cancel_subscription not implemented sub=%s", provider_subscription_id)
        return False

    def reactivate_subscription(self, provider_subscription_id: str) -> bool:
        logger.warning("PayPal reactivate_subscription not implemented sub=%s", provider_subscription_id)
        return False

    def parse_webhook(
        self,
        *,
        body: bytes,
        signature: str | None,
    ) -> BillingWebhookPayload | None:
        return None


@dataclass(frozen=True)
class BillingProviderRegistration:
    """One row per supported backend implementation — add/remove providers here."""

    key: str
    factory: Callable[[], BillingProvider]
    is_configured: Callable[[], bool]


def _stripe_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _paypal_configured() -> bool:
    return bool(settings.PAYPAL_CLIENT_ID and settings.PAYPAL_CLIENT_SECRET)


_REGISTRY: tuple[BillingProviderRegistration, ...] = (
    BillingProviderRegistration(
        key="stripe",
        factory=StripeBillingProvider,
        is_configured=_stripe_configured,
    ),
    BillingProviderRegistration(
        key="paypal",
        factory=PayPalBillingProvider,
        is_configured=_paypal_configured,
    ),
)

_REGISTRY_BY_KEY: dict[str, BillingProviderRegistration] = {r.key: r for r in _REGISTRY}


def iter_billing_provider_registrations() -> tuple[BillingProviderRegistration, ...]:
    return _REGISTRY


def get_billing_provider_registration(key: str) -> BillingProviderRegistration | None:
    return _REGISTRY_BY_KEY.get((key or "").strip().lower())


def get_billing_provider(provider: str) -> BillingProvider | None:
    reg = get_billing_provider_registration(provider)
    return reg.factory() if reg else None


def is_provider_implemented(key: str) -> bool:
    return (key or "").strip().lower() in _REGISTRY_BY_KEY
