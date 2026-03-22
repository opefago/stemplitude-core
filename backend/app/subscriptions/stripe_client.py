"""Thin wrapper around Stripe for checkout and subscription management."""

import logging
from uuid import UUID

import stripe

from app.config import settings

logger = logging.getLogger(__name__)


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
    price_id: str,
    billing_cycle: str = "monthly",
    trial_days: int = 0,
    metadata: dict | None = None,
) -> stripe.checkout.Session | None:
    """Create a Stripe Checkout session for subscription.

    Args:
        tenant_id: Tenant UUID
        user_id: User UUID
        user_email: Customer email
        plan_id: Plan UUID
        success_url: Redirect URL on success
        cancel_url: Redirect URL on cancel
        price_id: Stripe Price ID (monthly or yearly)
        billing_cycle: 'monthly' or 'yearly'
        trial_days: Trial period in days
        metadata: Additional metadata

    Returns:
        Stripe Session or None if Stripe is not configured
    """
    if not settings.STRIPE_SECRET_KEY:
        logger.warning("Stripe not configured, skipping checkout session creation")
        return None

    configure_stripe()

    meta = metadata or {}
    meta["tenant_id"] = str(tenant_id)
    meta["user_id"] = str(user_id)
    meta["plan_id"] = str(plan_id)

    session_params: dict = {
        "mode": "subscription",
        "customer_email": user_email,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "line_items": [
            {
                "price": price_id,
                "quantity": 1,
            }
        ],
        "metadata": meta,
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


def retrieve_subscription(stripe_subscription_id: str) -> stripe.Subscription | None:
    """Retrieve a Stripe subscription."""
    if not settings.STRIPE_SECRET_KEY:
        return None

    configure_stripe()
    try:
        return stripe.Subscription.retrieve(stripe_subscription_id)
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
