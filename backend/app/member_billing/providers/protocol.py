"""Shared interface for Connect-style marketplace providers (Stripe, future PayPal)."""

from __future__ import annotations

from typing import Protocol


class MemberMarketplaceProvider(Protocol):
    """Collects from payers on behalf of a tenant (connected / partner-delegated account).

    Stripe Connect is implemented in ``stripe_connect.py`` and ``MemberBillingService``.
    PayPal Commerce Platform for Marketplaces should implement the same surface when added.
    """

    provider_id: str
