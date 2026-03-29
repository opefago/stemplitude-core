"""Resolve Stripe Price IDs for checkout (plan row + optional dev fallbacks)."""

from app.config import settings
from app.plans.models import Plan


def effective_stripe_price_id(plan: Plan, *, billing_cycle: str) -> str | None:
    """Return the Stripe Price ID to use for checkout, or None if unavailable."""
    raw = (
        plan.stripe_price_id_yearly
        if billing_cycle == "yearly"
        else plan.stripe_price_id_monthly
    )
    if raw and str(raw).strip():
        return str(raw).strip()
    if not settings.is_development:
        return None
    fb = (
        settings.STRIPE_DEV_FALLBACK_PRICE_YEARLY
        if billing_cycle == "yearly"
        else settings.STRIPE_DEV_FALLBACK_PRICE_MONTHLY
    )
    fb = (fb or "").strip()
    return fb or None


def stripe_checkout_ready(plan: Plan) -> tuple[bool, bool]:
    """Whether monthly/yearly Stripe checkout can start (plan IDs or dev fallback)."""
    monthly = bool(effective_stripe_price_id(plan, billing_cycle="monthly"))
    yearly = bool(effective_stripe_price_id(plan, billing_cycle="yearly"))
    return monthly, yearly
