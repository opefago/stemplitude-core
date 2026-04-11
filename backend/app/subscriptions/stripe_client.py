"""Thin wrapper around Stripe for checkout and subscription management."""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import stripe

from app.config import settings

logger = logging.getLogger(__name__)


def _stripe_payload_attr(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def billing_period_unix_bounds_from_stripe_subscription(stripe_sub: Any) -> tuple[Any, Any]:
    """Return ``(current_period_start, current_period_end)`` as Stripe sends them (unix or None).

    Recent Stripe API versions expose billing period bounds on each `subscription_item` only;
    older payloads still set them on the subscription object. Webhooks may send either shape.
    """
    top_s = _stripe_payload_attr(stripe_sub, "current_period_start")
    top_e = _stripe_payload_attr(stripe_sub, "current_period_end")
    if top_s is not None and top_e is not None:
        return top_s, top_e

    items = _stripe_payload_attr(stripe_sub, "items")
    rows = _stripe_payload_attr(items, "data") if items is not None else None
    if not isinstance(rows, list):
        rows = []

    starts: list[Any] = []
    ends: list[Any] = []
    for it in rows:
        if _stripe_payload_attr(it, "deleted"):
            continue
        s = _stripe_payload_attr(it, "current_period_start")
        e = _stripe_payload_attr(it, "current_period_end")
        if s is not None:
            starts.append(s)
        if e is not None:
            ends.append(e)

    item_s = min(starts) if starts else None
    item_e = max(ends) if ends else None

    out_s = top_s if top_s is not None else item_s
    out_e = top_e if top_e is not None else item_e
    return out_s, out_e


def stripe_unix_to_aware_utc(value: Any) -> datetime | None:
    """Normalize Stripe API timestamps (unix or datetime) to timezone-aware UTC."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    try:
        ts = int(float(value))
    except (TypeError, ValueError):
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (OSError, OverflowError, ValueError):
        return None


def configure_stripe() -> None:
    """Set Stripe API key from settings."""
    if settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(
    *,
    tenant_id: UUID,
    user_id: UUID,
    user_email: str,
    plan_id: UUID,
    success_url: str,
    cancel_url: str,
    line_item: dict,
    billing_cycle: str = "monthly",
    trial_days: int = 0,
    metadata: dict | None = None,
) -> stripe.checkout.Session | None:
    """Create a Stripe Checkout session for subscription.

    ``line_item`` is one entry for ``line_items`` (either ``{"price": id, "quantity": 1}`` or
    ``{"price_data": {...}, "quantity": 1}``).
    """
    if not settings.STRIPE_SECRET_KEY:
        logger.warning("Stripe not configured, skipping checkout session creation")
        return None

    configure_stripe()

    meta = metadata or {}
    meta["tenant_id"] = str(tenant_id)
    meta["user_id"] = str(user_id)
    meta["plan_id"] = str(plan_id)

    # Survives thin/partial webhook payloads when session.metadata is incomplete.
    client_reference_id = f"{tenant_id}|{user_id}|{plan_id}"
    if len(client_reference_id) > 200:
        client_reference_id = client_reference_id[:200]

    session_params: dict = {
        "mode": "subscription",
        "customer_email": user_email,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "line_items": [line_item],
        "metadata": meta,
        "client_reference_id": client_reference_id,
        "subscription_data": {
            "metadata": meta,
        },
    }

    if trial_days > 0:
        session_params["subscription_data"]["trial_period_days"] = trial_days

    try:
        session = stripe.checkout.Session.create(**session_params)
        logger.info("Stripe checkout created session=%s tenant=%s", session.id, tenant_id)
        return session
    except stripe.error.StripeError:
        logger.error("Stripe checkout creation failed tenant=%s", tenant_id, exc_info=True)
        raise


def list_checkout_sessions_for_subscription(subscription_id: str, *, limit: int = 5) -> Any | None:
    """List Checkout Sessions that created this subscription (metadata often lives on the session)."""
    if not settings.STRIPE_SECRET_KEY or not (subscription_id or "").strip():
        return None

    configure_stripe()
    try:
        return stripe.checkout.Session.list(
            subscription=subscription_id.strip(),
            limit=min(max(limit, 1), 10),
        )
    except stripe.error.StripeError:
        logger.warning(
            "Stripe Session.list failed subscription=%s",
            subscription_id,
            exc_info=True,
        )
        return None


def retrieve_checkout_session(session_id: str) -> stripe.checkout.Session | None:
    """Load a Checkout Session from Stripe (e.g. webhook payload missing subscription id)."""
    if not settings.STRIPE_SECRET_KEY or not (session_id or "").strip():
        return None

    configure_stripe()
    try:
        return stripe.checkout.Session.retrieve(
            session_id.strip(),
            expand=["subscription"],
        )
    except stripe.error.StripeError:
        logger.error("Stripe checkout session retrieve failed session=%s", session_id, exc_info=True)
        return None


def cancel_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Cancel a Stripe subscription at period end."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        result = stripe.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=True,
        )
        logger.info("Stripe subscription canceled sub=%s", stripe_subscription_id)
        return result
    except stripe.error.StripeError:
        logger.error("Stripe cancel failed sub=%s", stripe_subscription_id, exc_info=True)
        raise


def reactivate_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Reactivate a subscription that was set to cancel at period end."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        result = stripe.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=False,
        )
        logger.info("Stripe subscription reactivated sub=%s", stripe_subscription_id)
        return result
    except stripe.error.StripeError:
        logger.error("Stripe reactivate failed sub=%s", stripe_subscription_id, exc_info=True)
        raise


def pause_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Pause collection for a Stripe subscription."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        result = stripe.Subscription.modify(
            stripe_subscription_id,
            pause_collection={"behavior": "mark_uncollectible"},
        )
        logger.info("Stripe subscription paused sub=%s", stripe_subscription_id)
        return result
    except stripe.error.StripeError:
        logger.error("Stripe pause failed sub=%s", stripe_subscription_id, exc_info=True)
        raise


def resume_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Resume collection for a paused Stripe subscription."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        result = stripe.Subscription.modify(
            stripe_subscription_id,
            pause_collection=None,
        )
        logger.info("Stripe subscription resumed sub=%s", stripe_subscription_id)
        return result
    except stripe.error.StripeError:
        logger.error("Stripe resume failed sub=%s", stripe_subscription_id, exc_info=True)
        raise


def list_invoices_for_stripe_subscription(
    stripe_subscription_id: str, *, limit: int = 50
) -> Any | None:
    """List Stripe invoices for a subscription (billing history backfill)."""
    if not settings.STRIPE_SECRET_KEY or not (stripe_subscription_id or "").strip():
        return None

    configure_stripe()
    try:
        return stripe.Invoice.list(
            subscription=stripe_subscription_id.strip(),
            limit=min(max(limit, 1), 100),
        )
    except stripe.error.StripeError:
        logger.warning(
            "Stripe Invoice.list failed subscription=%s",
            stripe_subscription_id,
            exc_info=True,
        )
        return None


def retrieve_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Retrieve a Stripe subscription."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        return stripe.Subscription.retrieve(
            stripe_subscription_id,
            expand=["items.data"],
        )
    except stripe.error.StripeError:
        logger.error("Stripe retrieve failed sub=%s", stripe_subscription_id, exc_info=True)
        return None


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event | None:
    """Construct and verify a Stripe webhook event from raw payload."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        return None

    configure_stripe()
    try:
        return stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed")
        return None
