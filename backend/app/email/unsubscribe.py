"""Signed unsubscribe links, suppression scope, and RFC 8058 one-click URL resolution.

Critical routes (auth, security) never use signed placeholders or List-Unsubscribe headers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urljoin
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

# Reserved URL embedded at template build time; replaced per recipient at enqueue.
UNSUBSCRIBE_URL_PLACEHOLDER = "https://unsub.stemplitude.invalid/pending"

JWT_AUD_EMAIL_UNSUB = "email-unsub"

# Must-send even if recipient opted out of optional mail (account recovery, etc.).
CRITICAL_EMAIL_ROUTE_KEYS: frozenset[str] = frozenset(
    {
        "auth_verify",
        "auth_otp",
        "auth_password_reset",
        "security",
    }
)


def is_critical_email_route(route_key: str | None) -> bool:
    k = (route_key or "").strip().lower()
    return k in CRITICAL_EMAIL_ROUTE_KEYS


def normalize_subscriber_email(raw: str) -> str | None:
    chunk = (raw or "").strip()
    if not chunk or "@" not in chunk:
        return None
    try:
        v = validate_email(chunk, check_deliverability=False)
        return (v.normalized or v.email or "").strip().lower()
    except EmailNotValidError:
        return None


def mailing_footer_unsubscribe_href(route_key: str | None) -> str:
    """Footer link target: static env URL, or placeholder when signed URLs will be resolved at enqueue."""
    if is_critical_email_route(route_key):
        return (settings.EMAIL_UNSUBSCRIBE_URL or "").strip()
    public = (settings.EMAIL_PUBLIC_BASE_URL or "").strip().rstrip("/")
    if public:
        return UNSUBSCRIBE_URL_PLACEHOLDER
    return (settings.EMAIL_UNSUBSCRIBE_URL or "").strip()


def signed_unsubscribe_enabled(route_key: str | None) -> bool:
    return bool(
        (settings.EMAIL_PUBLIC_BASE_URL or "").strip()
        and not is_critical_email_route(route_key)
    )


def build_unsubscribe_token(*, email: str, tenant_id: UUID | None, route_key: str) -> str:
    norm = normalize_subscriber_email(email)
    if not norm:
        raise ValueError("invalid email for unsubscribe token")
    now = datetime.now(timezone.utc)
    payload = {
        "unsub_kind": "email_list",
        "email": norm,
        "tid": str(tenant_id) if tenant_id else None,
        "rk": (route_key or "").strip().lower(),
        "iat": now,
        "exp": now + timedelta(days=400),
        "aud": JWT_AUD_EMAIL_UNSUB,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_unsubscribe_token(token: str) -> dict | None:
    if not (token or "").strip():
        return None
    try:
        payload = jwt.decode(
            token.strip(),
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=JWT_AUD_EMAIL_UNSUB,
        )
    except JWTError:
        return None
    if payload.get("unsub_kind") != "email_list" or not (payload.get("email") or "").strip():
        return None
    return payload


def public_unsubscribe_url(token: str) -> str:
    """Absolute unsubscribe URL; avoids duplicating ``API_V1_PREFIX`` if base already ends with it."""
    base = (settings.EMAIL_PUBLIC_BASE_URL or "").strip().rstrip("/")
    prefix = (settings.API_V1_PREFIX or "/api/v1").rstrip("/")
    suffix = "/public/email/unsubscribe"
    q = quote(token.strip(), safe="")
    query = f"?token={q}"
    rel = f"{prefix}{suffix}{query}"

    if not base:
        return rel if rel.startswith("/") else f"/{rel}"
    if prefix and base.endswith(prefix):
        return f"{base}{suffix}{query}"
    return urljoin(f"{base}/", rel.lstrip("/"))


def resolve_prepared_message_for_send(
    prepared: "PreparedTransactionalEmail",
    *,
    to_email: str,
    tenant_id: UUID | str | None,
) -> tuple["TransactionalEmail", str | None]:
    """Swap footer placeholder for a signed URL and return the RFC 8058 one-click HTTPS URL (or None)."""
    from app.email.templates import TransactionalEmail

    msg = prepared.message
    tid: UUID | None = None
    if tenant_id is not None and str(tenant_id).strip():
        try:
            tid = UUID(str(tenant_id))
        except ValueError:
            tid = None

    placeholder = UNSUBSCRIBE_URL_PLACEHOLDER
    if placeholder not in msg.html and placeholder not in msg.plain:
        return msg, None

    if is_critical_email_route(prepared.route_key):
        return msg, None

    if not signed_unsubscribe_enabled(prepared.route_key):
        fb = (settings.EMAIL_UNSUBSCRIBE_URL or "").strip()
        html = msg.html.replace(placeholder, fb)
        plain = msg.plain.replace(placeholder, fb)
        return TransactionalEmail(html=html, plain=plain), None

    norm = normalize_subscriber_email(to_email)
    if not norm:
        logger.warning("Cannot resolve unsubscribe placeholder: invalid to_email")
        fb = (settings.EMAIL_UNSUBSCRIBE_URL or "").strip()
        return (
            TransactionalEmail(
                html=msg.html.replace(placeholder, fb),
                plain=msg.plain.replace(placeholder, fb),
            ),
            None,
        )

    try:
        tok = build_unsubscribe_token(email=norm, tenant_id=tid, route_key=prepared.route_key)
    except ValueError:
        fb = (settings.EMAIL_UNSUBSCRIBE_URL or "").strip()
        return (
            TransactionalEmail(
                html=msg.html.replace(placeholder, fb),
                plain=msg.plain.replace(placeholder, fb),
            ),
            None,
        )

    url = public_unsubscribe_url(tok)
    return (
        TransactionalEmail(
            html=msg.html.replace(placeholder, url),
            plain=msg.plain.replace(placeholder, url),
            list_unsubscribe_one_click_url=url,
        ),
        url,
    )
