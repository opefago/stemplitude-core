"""Load billing provider registry and expose options for the API."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from app.subscriptions.billing_provider import (
    get_billing_provider_registration,
    is_provider_implemented,
)

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "billing_provider_registry.json"
_registry_cache: list[dict] | None = None


@dataclass(frozen=True)
class BillingProviderDefinition:
    key: str
    label: str
    description: str
    implements_subscription_checkout: bool


@dataclass(frozen=True)
class BillingProviderOptionOut:
    """Serializable option for clients (e.g. billing page)."""

    key: str
    label: str
    description: str
    configured: bool
    available_for_checkout: bool


def _env_configured_for_provider(key: str) -> bool:
    reg = get_billing_provider_registration(key)
    if not reg:
        return False
    try:
        return bool(reg.is_configured())
    except Exception:
        logger.exception("billing provider is_configured check failed key=%s", key)
        return False


def load_provider_definitions() -> list[BillingProviderDefinition]:
    global _registry_cache
    if _registry_cache is not None:
        raw = _registry_cache
    else:
        if not _REGISTRY_PATH.exists():
            logger.error("billing_provider_registry.json missing at %s", _REGISTRY_PATH)
            return []
        with open(_REGISTRY_PATH, encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("providers", [])
        _registry_cache = raw

    out: list[BillingProviderDefinition] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key", "")).strip().lower()
        if not key:
            continue
        if not is_provider_implemented(key):
            logger.warning(
                "billing_provider_registry.json lists key=%s but no implementation is registered "
                "in app.subscriptions.billing_provider._REGISTRY — ignoring.",
                key,
            )
            continue
        out.append(
            BillingProviderDefinition(
                key=key,
                label=str(row.get("label", key)).strip() or key,
                description=str(row.get("description", "")).strip(),
                implements_subscription_checkout=bool(row.get("implements_subscription_checkout", False)),
            )
        )
    return out


def list_billing_provider_options() -> list[BillingProviderOptionOut]:
    """All known providers with configuration and checkout availability."""
    result: list[BillingProviderOptionOut] = []
    for d in load_provider_definitions():
        configured = _env_configured_for_provider(d.key)
        available = configured and d.implements_subscription_checkout
        result.append(
            BillingProviderOptionOut(
                key=d.key,
                label=d.label,
                description=d.description,
                configured=configured,
                available_for_checkout=available,
            )
        )
    return result


def validate_checkout_provider(payment_provider: str) -> tuple[str | None, int | None]:
    """Return (error_message, http_status) if checkout must not proceed; else (None, None)."""
    key = (payment_provider or "stripe").strip().lower()
    options = {o.key: o for o in list_billing_provider_options()}
    if key not in options:
        return f"Unknown payment provider: {key}", 400
    opt = options[key]
    if not opt.available_for_checkout:
        if not opt.configured:
            return (
                f"{opt.label} is not configured on the server (missing credentials).",
                503,
            )
        return (
            f"{opt.label} is not available for subscription checkout yet.",
            501,
        )
    return None, None
