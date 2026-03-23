"""Billing provider abstraction (Stripe first implementation)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from uuid import UUID

from .stripe_client import (
    cancel_subscription as stripe_cancel_subscription,
    construct_webhook_event as stripe_construct_webhook_event,
    create_checkout_session as stripe_create_checkout_session,
    reactivate_subscription as stripe_reactivate_subscription,
)


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
    ) -> BillingCheckoutSession | None:
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
        )
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


def get_billing_provider(provider: str) -> BillingProvider | None:
    provider_key = (provider or "").strip().lower()
    if provider_key == "stripe":
        return StripeBillingProvider()
    return None


def normalize_period(ts_value: int | None) -> datetime | None:
    if not ts_value:
        return None
    return datetime.fromtimestamp(ts_value, tz=timezone.utc)
