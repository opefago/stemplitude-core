"""Resolve Stripe checkout line items (catalog Price IDs or dev price_data)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.config import settings

if TYPE_CHECKING:
    from app.plans.models import Plan

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "plan_registry.json"


def _parse_dev_slug_price_json(raw: str) -> dict[str, str]:
    s = (raw or "").strip()
    if not s:
        return {}
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        logger.warning("Invalid STRIPE_DEV_PLAN_PRICE_*_JSON; expected a JSON object")
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in data.items():
        if v is None:
            continue
        vs = str(v).strip()
        if vs:
            out[str(k).strip()] = vs
    return out


def _stripe_price_from_plan_registry(slug: str, *, billing_cycle: str) -> str | None:
    if not slug or not _REGISTRY_PATH.is_file():
        return None
    try:
        payload = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    key = "stripe_price_id_yearly" if billing_cycle == "yearly" else "stripe_price_id_monthly"
    for plan in payload.get("plans", []):
        if plan.get("slug") != slug:
            continue
        val = plan.get(key)
        if val is None or not str(val).strip():
            return None
        return str(val).strip()
    return None


def _dev_slug_price_map(billing_cycle: str) -> dict[str, str]:
    raw = (
        settings.STRIPE_DEV_PLAN_PRICE_YEARLY_JSON
        if billing_cycle == "yearly"
        else settings.STRIPE_DEV_PLAN_PRICE_MONTHLY_JSON
    )
    return _parse_dev_slug_price_json(raw)


def _catalog_stripe_price_id(plan: Plan, *, billing_cycle: str) -> str | None:
    """Stripe Price id from DB, plan_registry.json, or STRIPE_DEV_PLAN_PRICE_*_JSON only."""
    raw = (
        plan.stripe_price_id_yearly
        if billing_cycle == "yearly"
        else plan.stripe_price_id_monthly
    )
    if raw and str(raw).strip():
        return str(raw).strip()
    if not settings.is_development:
        return None
    slug = (plan.slug or "").strip()
    reg = _stripe_price_from_plan_registry(slug, billing_cycle=billing_cycle)
    if reg:
        return reg
    dev_map = _dev_slug_price_map(billing_cycle)
    if slug and slug in dev_map:
        return dev_map[slug]
    return None


def _dev_global_fallback_price_id(*, billing_cycle: str) -> str | None:
    fb = (
        settings.STRIPE_DEV_FALLBACK_PRICE_YEARLY
        if billing_cycle == "yearly"
        else settings.STRIPE_DEV_FALLBACK_PRICE_MONTHLY
    )
    fb = (fb or "").strip()
    return fb or None


def effective_stripe_price_id(plan: Plan, *, billing_cycle: str) -> str | None:
    """Return a Stripe Price ID when checkout can use a fixed catalog price, else None."""
    rid = _catalog_stripe_price_id(plan, billing_cycle=billing_cycle)
    if rid:
        return rid
    if settings.is_development:
        return _dev_global_fallback_price_id(billing_cycle=billing_cycle)
    return None


def _plan_unit_amount_cents_and_interval(
    plan: Plan, *, billing_cycle: str
) -> tuple[int | None, str | None]:
    raw = plan.price_yearly if billing_cycle == "yearly" else plan.price_monthly
    interval = "year" if billing_cycle == "yearly" else "month"
    if raw is None:
        return None, None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None, None
    if val <= 0:
        return None, None
    cents = int(round(val * 100))
    if cents <= 0:
        return None, None
    return cents, interval


def subscription_checkout_line_item(
    plan: Plan, *, billing_cycle: str
) -> tuple[dict[str, Any] | None, str | None]:
    """One Stripe Checkout ``line_items`` entry for a subscription (price id or price_data).

    In development, if no catalog Price id is configured, uses ``price_data`` from the plan's
    list price so each plan shows the correct amount (avoids one STRIPE_DEV_FALLBACK_* for all).
    """
    rid = _catalog_stripe_price_id(plan, billing_cycle=billing_cycle)
    if rid:
        return {"price": rid, "quantity": 1}, None

    if settings.is_development:
        cents, interval = _plan_unit_amount_cents_and_interval(plan, billing_cycle=billing_cycle)
        if cents is not None and interval:
            currency = (settings.STRIPE_CHECKOUT_CURRENCY or "usd").strip().lower() or "usd"
            name = (plan.name or plan.slug or "Subscription").strip() or "Subscription"
            logger.info(
                "Dev checkout using price_data slug=%s cycle=%s unit_amount_cents=%s",
                plan.slug,
                billing_cycle,
                cents,
            )
            return (
                {
                    "price_data": {
                        "currency": currency,
                        "product_data": {"name": name},
                        "recurring": {"interval": interval},
                        "unit_amount": cents,
                    },
                    "quantity": 1,
                },
                None,
            )
        fb = _dev_global_fallback_price_id(billing_cycle=billing_cycle)
        if fb:
            return {"price": fb, "quantity": 1}, None
        return (
            None,
            "This plan has no list price and no Stripe Price ID for the selected billing cycle. "
            "Set stripe_price_id_* on the plan, add amounts in the database, or set STRIPE_DEV_FALLBACK_*.",
        )

    return (
        None,
        "This plan has no Stripe Price ID for the selected billing cycle. "
        "Set stripe_price_id_monthly / stripe_price_id_yearly on the plan (database or "
        "backend/config/plan_registry.json) or configure your billing catalog.",
    )


def stripe_checkout_ready(plan: Plan) -> tuple[bool, bool]:
    """Whether monthly/yearly Stripe checkout can start."""
    m, _ = subscription_checkout_line_item(plan, billing_cycle="monthly")
    y, _ = subscription_checkout_line_item(plan, billing_cycle="yearly")
    return m is not None, y is not None
