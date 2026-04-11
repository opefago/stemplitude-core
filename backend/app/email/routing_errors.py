"""Classify outbound email failures for adaptive routing (retryable vs client/config issues)."""

from __future__ import annotations

import re

import httpx

# Client / configuration / content issues — do not penalize provider×domain health.
_NON_RETRYABLE_SUBSTRINGS = (
    "server_token is missing",
    "api_key is missing",
    "not implemented",
    "does not support attachments",
    "no credentials",
    "valid credentials",
    "supports one recipient",
    "invalid from",
    "inactive recipient",
    "inactive recipients",
    "blacklist",
    "suppression",
    "validation",
    "invalid email",
    "malformed",
    "bad request",
    "unauthorized",
    "forbidden",
    "not found",
    "invalid token",
    "authentication",
)

_RETRYABLE_SUBSTRINGS = (
    "timeout",
    "timed out",
    "temporarily",
    "temporary",
    "rate limit",
    "throttl",
    "too many requests",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "connection reset",
    "connection refused",
    "connection aborted",
    "eof",
    "broken pipe",
    "try again",
    "overload",
    "capacity",
)

# HTTP codes embedded in provider error text (SendGrid/Postmark sometimes include them).
_RETRYABLE_STATUS_RE = re.compile(r"(?:^|[^\d])(429|408|5\d{2})(?:[^\d]|$)")
_NON_RETRYABLE_STATUS_RE = re.compile(r"(?:^|[^\d])(400|401|403|404|405|422)(?:[^\d]|$)")


def _classify_exception(exc: BaseException) -> bool | None:
    """Return True/False if ``exc`` alone decides; None to fall through to message heuristics."""
    if isinstance(
        exc,
        (
            httpx.TimeoutException,
            httpx.ConnectError,
            httpx.ReadError,
            httpx.WriteError,
            httpx.RemoteProtocolError,
            httpx.ProxyError,
        ),
    ):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        s = exc.response.status_code
        if s == 429 or s == 408 or s >= 500:
            return True
        if 400 <= s < 500:
            return False
        return True
    if isinstance(exc, (ConnectionError, OSError)):
        return True
    # Celery/worker sometimes wraps the real failure
    cause = getattr(exc, "__cause__", None)
    if isinstance(cause, BaseException) and cause is not exc:
        inner = _classify_exception(cause)
        if inner is not None:
            return inner
    return None


def is_retryable_email_failure(
    *,
    error_message: str | None,
    exc: BaseException | None = None,
) -> bool:
    """True if this failure looks **transient / provider-side** and should advance cooldown streaks.

    False for missing config, auth, validation, and similar **caller/content** problems so we do
    not short-circuit a provider for our mistakes.
    """
    if exc is not None:
        decided = _classify_exception(exc)
        if decided is not None:
            return decided

    msg = (error_message or "").strip().lower()
    if not msg:
        return True

    if any(s in msg for s in _NON_RETRYABLE_SUBSTRINGS):
        return False
    if any(s in msg for s in _RETRYABLE_SUBSTRINGS):
        return True

    if _NON_RETRYABLE_STATUS_RE.search(msg):
        return False
    if _RETRYABLE_STATUS_RE.search(msg):
        return True

    # Unknown API text: prefer failover (treat as possibly transient).
    return True
