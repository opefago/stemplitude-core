"""PayPal Commerce Platform for Marketplaces — phase 2 (placeholder).

Checkout is rejected at the HTTP layer (``501``) until partner onboarding, seller tracking,
and webhooks mirror the Stripe Connect path in ``webhooks.py`` / ``service.py``.
"""

from __future__ import annotations


class PayPalMemberMarketplaceProvider:
    """Type anchor for :class:`MemberMarketplaceProvider`; no runtime wiring yet."""

    provider_id = "paypal"
