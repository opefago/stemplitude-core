"""Rate limits and eligibility checks for cardless signup trials."""

from __future__ import annotations

import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.trials.models import TrialGrant

logger = logging.getLogger(__name__)

# Common throwaway domains (extend via settings / blocklist file later).
_DISPOSABLE_EMAIL_DOMAINS: frozenset[str] = frozenset(
    {
        "mailinator.com",
        "guerrillamail.com",
        "guerrillamail.org",
        "tempmail.com",
        "temp-mail.org",
        "10minutemail.com",
        "yopmail.com",
        "trashmail.com",
        "fakeinbox.com",
        "dispostable.com",
        "maildrop.cc",
        "getnada.com",
        "sharklasers.com",
    }
)

_REDIS_ONBOARD_IP_KEY = "trial:onboard:ip:{ip}:{day}"
_REDIS_ONBOARD_EMAIL_BURST = "trial:onboard:email:{email_hash}:{hour}"


def normalize_email(email: str) -> str:
    s = (email or "").strip().lower()
    # Gmail-style dots/plus are not merged (optional hardening later).
    return s


def _domain_from_email(email: str) -> str:
    parts = normalize_email(email).split("@", 1)
    return parts[1] if len(parts) == 2 else ""


def disposable_email_blocked(email: str) -> bool:
    if not settings.TRIAL_BLOCK_DISPOSABLE_EMAIL:
        return False
    domain = _domain_from_email(email)
    if domain in _DISPOSABLE_EMAIL_DOMAINS:
        return True
    extra = settings.TRIAL_DISPOSABLE_EMAIL_DOMAINS_EXTRA or ""
    extra_set = {d.strip().lower() for d in extra.split(",") if d.strip()}
    return domain in extra_set


async def trial_email_already_used(db: AsyncSession, email_normalized: str) -> bool:
    result = await db.execute(
        select(TrialGrant.id).where(TrialGrant.email_normalized == email_normalized).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def assert_onboard_rate_limits(client_ip: str | None, email: str) -> None:
    """Redis-backed soft limits; fails open if Redis errors."""
    from app.core.redis import get_redis

    try:
        redis = await get_redis()
    except Exception:
        logger.warning("Trial rate limit skipped: Redis unavailable")
        return

    from datetime import datetime, timezone

    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    ip = (client_ip or "unknown").strip()[:64] or "unknown"
    ip_key = _REDIS_ONBOARD_IP_KEY.format(ip=ip, day=day)
    try:
        n = await redis.incr(ip_key)
        if n == 1:
            await redis.expire(ip_key, 86400)
        if n > settings.TRIAL_MAX_ONBOARDS_PER_IP_PER_DAY:
            from app.auth.service import AuthError

            raise AuthError(
                "Too many sign-ups from this network today. Try again tomorrow or contact support.",
                status_code=429,
            )
    except AuthError:
        raise
    except Exception as exc:
        logger.warning("Trial IP rate limit check failed: %s", exc)

    # Short burst per normalized email (same hour)
    try:
        import hashlib

        from datetime import datetime, timezone

        hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        eh = hashlib.sha256(normalize_email(email).encode()).hexdigest()[:32]
        burst_key = _REDIS_ONBOARD_EMAIL_BURST.format(email_hash=eh, hour=hour)
        b = await redis.incr(burst_key)
        if b == 1:
            await redis.expire(burst_key, 3600)
        if b > settings.TRIAL_MAX_ONBOARD_ATTEMPTS_PER_EMAIL_HOUR:
            from app.auth.service import AuthError

            raise AuthError(
                "Too many attempts for this email. Wait an hour or use a different address.",
                status_code=429,
            )
    except AuthError:
        raise
    except Exception as exc:
        logger.warning("Trial email burst check failed: %s", exc)


async def record_trial_grant(
    db: AsyncSession,
    *,
    email_normalized: str,
    user_id: UUID,
    tenant_id: UUID,
    signup_ip: str | None,
) -> None:
    row = TrialGrant(
        email_normalized=email_normalized,
        user_id=user_id,
        tenant_id=tenant_id,
        signup_ip=(signup_ip or "")[:64] or None,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        from app.auth.service import AuthError

        raise AuthError(
            "A free trial has already been started with this email address.",
            status_code=409,
        ) from None


def validate_onboard_request_shape(email: str, first_name: str, last_name: str) -> None:
    """Reject obvious automation / empty payloads."""
    from app.auth.service import AuthError

    if not normalize_email(email):
        raise AuthError("Email is required", status_code=400)
    if len(first_name.strip()) < 1 or len(last_name.strip()) < 1:
        raise AuthError("First and last name are required", status_code=400)
    if len(email) > 254:
        raise AuthError("Email is too long", status_code=400)
    # Reject pathological repeated characters (simple bot signal)
    if re.search(r"(.)\1{15,}", email):
        raise AuthError("Invalid email", status_code=400)
