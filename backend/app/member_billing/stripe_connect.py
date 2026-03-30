"""Stripe Connect API helpers (direct charges on connected accounts)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import stripe

from app.config import settings

logger = logging.getLogger(__name__)


def _configure() -> bool:
    if not settings.STRIPE_SECRET_KEY:
        return False
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return True


def create_express_connected_account(*, tenant_id: UUID, tenant_name: str) -> str | None:
    """Create a Stripe Express connected account. Returns account id or None."""
    if not _configure():
        return None
    try:
        acct = stripe.Account.create(
            type="express",
            capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
            metadata={"tenant_id": str(tenant_id), "tenant_name": tenant_name[:200]},
        )
        return acct.id
    except stripe.StripeError as e:
        logger.warning("create_express_connected_account failed: %s", e)
        return None


def create_account_link(
    *,
    account_id: str,
    refresh_url: str,
    return_url: str,
) -> str | None:
    if not _configure():
        return None
    try:
        link = stripe.AccountLink.create(
            account=account_id,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )
        return link.url
    except stripe.StripeError as e:
        logger.warning("create_account_link failed: %s", e)
        return None


def retrieve_account(account_id: str) -> Any | None:
    if not _configure():
        return None
    try:
        return stripe.Account.retrieve(account_id)
    except stripe.StripeError as e:
        logger.warning("retrieve_account failed: %s", e)
        return None


def ensure_stripe_product_price(
    *,
    connected_account_id: str,
    product_name: str,
    amount_cents: int,
    currency: str,
    billing_type: str,
    interval: str | None,
) -> tuple[str | None, str | None]:
    """Create Product + Price on connected account. Returns (product_id, price_id)."""
    if not _configure():
        return None, None
    try:
        prod = stripe.Product.create(
            name=product_name[:200],
            stripe_account=connected_account_id,
        )
        recurring: dict[str, Any] | None = None
        if billing_type == "recurring" and interval:
            if interval == "month":
                recurring = {"interval": "month", "interval_count": 1}
            elif interval == "quarter":
                recurring = {"interval": "month", "interval_count": 3}
            elif interval == "year":
                recurring = {"interval": "year", "interval_count": 1}
            else:
                recurring = {"interval": "month", "interval_count": 1}
        price_params: dict[str, Any] = {
            "product": prod.id,
            "unit_amount": amount_cents,
            "currency": currency.lower(),
            "stripe_account": connected_account_id,
        }
        if recurring:
            price_params["recurring"] = recurring
        price = stripe.Price.create(**price_params)
        return prod.id, price.id
    except stripe.StripeError as e:
        logger.warning("ensure_stripe_product_price failed: %s", e)
        return None, None


def create_member_checkout_session(
    *,
    connected_account_id: str,
    price_id: str,
    mode: str,
    success_url: str,
    cancel_url: str,
    customer_email: str | None,
    metadata: dict[str, str],
    application_fee_percent: float | None = None,
    application_fee_amount_cents: int | None = None,
) -> Any | None:
    if not _configure():
        return None
    params: dict[str, Any] = {
        "mode": mode,
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": metadata,
        "stripe_account": connected_account_id,
    }
    if customer_email:
        params["customer_email"] = customer_email
    if mode == "subscription":
        params["subscription_data"] = {"metadata": metadata}
        if application_fee_percent is not None and application_fee_percent > 0:
            params["subscription_data"]["application_fee_percent"] = round(application_fee_percent, 2)
    elif mode == "payment":
        pid: dict[str, Any] = {"metadata": metadata}
        if application_fee_amount_cents is not None and application_fee_amount_cents > 0:
            pid["application_fee_amount"] = application_fee_amount_cents
        params["payment_intent_data"] = pid
    try:
        return stripe.checkout.Session.create(**params)
    except stripe.StripeError as e:
        logger.warning("create_member_checkout_session failed: %s", e)
        return None


def retrieve_checkout_session(session_id: str, *, connected_account_id: str) -> Any | None:
    if not _configure():
        return None
    try:
        return stripe.checkout.Session.retrieve(session_id, stripe_account=connected_account_id)
    except stripe.StripeError as e:
        logger.warning("retrieve_checkout_session failed: %s", e)
        return None


def retrieve_invoice(invoice_id: str, *, connected_account_id: str) -> Any | None:
    if not _configure():
        return None
    try:
        return stripe.Invoice.retrieve(invoice_id, stripe_account=connected_account_id)
    except stripe.StripeError as e:
        logger.warning("retrieve_invoice failed: %s", e)
        return None


def retrieve_subscription(subscription_id: str, *, connected_account_id: str) -> Any | None:
    if not _configure():
        return None
    try:
        return stripe.Subscription.retrieve(subscription_id, stripe_account=connected_account_id)
    except stripe.StripeError as e:
        logger.warning("retrieve_subscription failed: %s", e)
        return None


def cancel_connected_subscription(
    *,
    connected_account_id: str,
    stripe_subscription_id: str,
    immediately: bool,
) -> Any | None:
    """Returns updated Subscription object from Stripe, or None on failure."""
    if not _configure():
        return None
    try:
        if immediately:
            return stripe.Subscription.delete(
                stripe_subscription_id, stripe_account=connected_account_id
            )
        return stripe.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=True,
            stripe_account=connected_account_id,
        )
    except stripe.StripeError as e:
        logger.warning("cancel_connected_subscription failed: %s", e)
        return None


def modify_connected_product(
    *,
    connected_account_id: str,
    stripe_product_id: str,
    name: str | None = None,
    description: str | None = None,
    description_set: bool = False,
    active: bool | None = None,
) -> bool:
    if not _configure():
        return False
    kwargs: dict[str, Any] = {}
    if name is not None:
        kwargs["name"] = name[:200]
    if description_set:
        kwargs["description"] = (description or "")[:5000]
    if active is not None:
        kwargs["active"] = active
    if not kwargs:
        return True
    try:
        stripe.Product.modify(stripe_product_id, stripe_account=connected_account_id, **kwargs)
        return True
    except stripe.StripeError as e:
        logger.warning("modify_connected_product failed: %s", e)
        return False


def create_price_on_connected_product(
    *,
    connected_account_id: str,
    stripe_product_id: str,
    amount_cents: int,
    currency: str,
    billing_type: str,
    interval: str | None,
) -> str | None:
    """Create a new Price on an existing Product (Stripe prices are immutable)."""
    if not _configure():
        return None
    recurring: dict[str, Any] | None = None
    if billing_type == "recurring" and interval:
        if interval == "month":
            recurring = {"interval": "month", "interval_count": 1}
        elif interval == "quarter":
            recurring = {"interval": "month", "interval_count": 3}
        elif interval == "year":
            recurring = {"interval": "year", "interval_count": 1}
        else:
            recurring = {"interval": "month", "interval_count": 1}
    price_params: dict[str, Any] = {
        "product": stripe_product_id,
        "unit_amount": amount_cents,
        "currency": currency.lower(),
        "stripe_account": connected_account_id,
    }
    if recurring:
        price_params["recurring"] = recurring
    try:
        price = stripe.Price.create(**price_params)
        return price.id
    except stripe.StripeError as e:
        logger.warning("create_price_on_connected_product failed: %s", e)
        return None


def archive_connected_price(*, connected_account_id: str, price_id: str) -> bool:
    if not _configure():
        return False
    try:
        stripe.Price.modify(price_id, active=False, stripe_account=connected_account_id)
        return True
    except stripe.StripeError as e:
        logger.warning("archive_connected_price failed: %s", e)
        return False
