"""Exact ``Request.url.path`` prefixes for middleware bypass (docs, webhooks, public email).

Call the ``*_skip_paths()`` functions at import time (or assign to class attributes) so paths
stay in sync with :attr:`app.config.settings.API_V1_PREFIX`.
"""

from __future__ import annotations

from app.config import settings

_STATIC = frozenset(
    {
        "/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
    }
)


_PUBLIC_EMAIL_ESP_WEBHOOK_SUFFIXES: tuple[str, ...] = (
    "/public/email/unsubscribe",
    "/webhooks/email/postmark",
    "/webhooks/email/sendgrid",
    "/webhooks/email/resend",
)


def _api_paths(*suffixes: str) -> frozenset[str]:
    """``suffixes`` start with ``/`` (e.g. ``/subscriptions/webhook``)."""
    p = settings.API_V1_PREFIX.rstrip("/")
    return frozenset(f"{p}{s}" for s in suffixes)


def tenant_middleware_skip_paths() -> frozenset[str]:
    """Skip tenant resolution (no ``X-Tenant-ID`` required): Stripe, public email, ESP webhooks."""
    return _STATIC | _api_paths("/subscriptions/webhook", *_PUBLIC_EMAIL_ESP_WEBHOOK_SUFFIXES)


def request_context_middleware_skip_paths() -> frozenset[str]:
    """Skip optional JWT parsing: same public/email paths as tenant skips except subscription webhook."""
    return _STATIC | _api_paths(*_PUBLIC_EMAIL_ESP_WEBHOOK_SUFFIXES)


def rate_limit_middleware_skip_paths() -> frozenset[str]:
    """Skip rate limiting for non-business/public endpoints and delivery webhooks."""
    return _STATIC | _api_paths("/subscriptions/webhook", *_PUBLIC_EMAIL_ESP_WEBHOOK_SUFFIXES)
