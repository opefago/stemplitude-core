"""Shared auth for inbound email provider webhooks (bearer, basic, or provider signing)."""

from __future__ import annotations

import base64
import binascii
import secrets

from fastapi import HTTPException, Request, status

from app.config import settings


def _has_any_shared_secret() -> bool:
    return bool(
        (settings.EMAIL_WEBHOOK_BEARER_TOKEN or "").strip()
        or (
            (settings.EMAIL_WEBHOOK_BASIC_USER or "").strip()
            and (settings.EMAIL_WEBHOOK_BASIC_PASSWORD or "").strip()
        )
    )


def verify_shared_bearer_or_basic(request: Request) -> None:
    """Reject unless Bearer or HTTP Basic matches configured secrets."""
    if not _has_any_shared_secret():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configure EMAIL_WEBHOOK_BEARER_TOKEN or EMAIL_WEBHOOK_BASIC_USER/PASSWORD",
        )

    bearer = (settings.EMAIL_WEBHOOK_BEARER_TOKEN or "").strip()
    if bearer:
        auth = (request.headers.get("authorization") or "").strip()
        if secrets.compare_digest(auth, f"Bearer {bearer}"):
            return

    bu = (settings.EMAIL_WEBHOOK_BASIC_USER or "").strip()
    bp = (settings.EMAIL_WEBHOOK_BASIC_PASSWORD or "").strip()
    if bu and bp:
        auth = (request.headers.get("authorization") or "").strip()
        if auth.lower().startswith("basic "):
            try:
                raw = base64.b64decode(auth[6:].strip()).decode("utf-8")
            except (UnicodeDecodeError, binascii.Error, ValueError):
                raw = ""
            if ":" in raw:
                u, _, p = raw.partition(":")
                if secrets.compare_digest(u, bu) and secrets.compare_digest(p, bp):
                    return

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook credentials")
