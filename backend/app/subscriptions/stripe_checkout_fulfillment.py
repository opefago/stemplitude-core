"""Provision local Subscription + license from Stripe Checkout (webhooks)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.subscriptions.license_sync import sync_license_from_subscription
from app.subscriptions.models import Subscription
from app.subscriptions.repository import SubscriptionRepository
from app.trials.cleanup import cancel_local_trial_subscriptions_for_tenant

logger = logging.getLogger(__name__)


def _norm_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().upper()
    return normalized or None


def checkout_session_view_from_dict(data: dict[str, Any]) -> Any:
    """Build a session-shaped object from ``event.data.object`` JSON (e.g. Celery ``stripe.webhook``)."""
    from types import SimpleNamespace

    if not isinstance(data, dict):
        data = {}
    md = data.get("metadata")
    return SimpleNamespace(
        id=data.get("id"),
        metadata=md if isinstance(md, dict) else {},
        subscription=data.get("subscription"),
        customer=data.get("customer"),
    )


def coerce_stripe_expandable_id(raw: Any) -> str | None:
    """Normalize Stripe id fields that may be a string, expanded object, or dict."""
    if raw is None:
        return None
    if isinstance(raw, str):
        s = raw.strip()
        return s or None
    sid = getattr(raw, "id", None)
    if isinstance(sid, str) and sid.strip():
        return sid.strip()
    if isinstance(raw, dict):
        v = raw.get("id")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


async def upsert_subscription_from_stripe_checkout(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
    plan_id: UUID,
    stripe_subscription_id: str,
    stripe_customer_id: str | None,
    provider_checkout_session_id: str | None,
    promo_code: str | None,
    affiliate_code: str | None,
    retrieve_subscription_fn=None,
) -> Subscription | None:
    """Create or update Subscription from checkout/subscription metadata; sync license."""
    from app.subscriptions.stripe_client import retrieve_subscription as default_retrieve

    retrieve = retrieve_subscription_fn or default_retrieve

    repo = SubscriptionRepository(db)
    sub = await repo.get_by_stripe_id(stripe_subscription_id)
    stripe_sub = retrieve(stripe_subscription_id)
    subscription_status = "active"
    if stripe_sub:
        subscription_status = getattr(stripe_sub, "status", None) or "active"

    if not sub:
        sub = Subscription(
            tenant_id=tenant_id,
            user_id=user_id,
            plan_id=plan_id,
            status=subscription_status,
            provider="stripe",
            provider_subscription_id=stripe_subscription_id,
            provider_customer_id=stripe_customer_id,
            provider_checkout_session_id=provider_checkout_session_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
            promo_code=promo_code,
            affiliate_code=affiliate_code,
        )
        db.add(sub)
        await db.flush()
    else:
        sub.tenant_id = tenant_id
        sub.user_id = user_id
        sub.plan_id = plan_id
        sub.status = subscription_status
        sub.provider = "stripe"
        sub.provider_subscription_id = stripe_subscription_id
        sub.provider_customer_id = stripe_customer_id
        if provider_checkout_session_id:
            sub.provider_checkout_session_id = provider_checkout_session_id
        sub.stripe_subscription_id = stripe_subscription_id
        sub.stripe_customer_id = stripe_customer_id
        sub.promo_code = promo_code
        sub.affiliate_code = affiliate_code
        await db.flush()

    if stripe_sub:
        from app.subscriptions.stripe_client import stripe_unix_to_aware_utc

        cps = stripe_unix_to_aware_utc(getattr(stripe_sub, "current_period_start", None))
        if cps is not None:
            sub.current_period_start = cps
        cpe = stripe_unix_to_aware_utc(getattr(stripe_sub, "current_period_end", None))
        if cpe is not None:
            sub.current_period_end = cpe
        te = stripe_unix_to_aware_utc(getattr(stripe_sub, "trial_end", None))
        if te is not None:
            sub.trial_end = te
        await db.flush()

    await sync_license_from_subscription(db, sub)
    await cancel_local_trial_subscriptions_for_tenant(db, tenant_id)
    logger.info(
        "Stripe subscription synced tenant=%s user=%s plan=%s stripe_sub=%s local_sub=%s",
        tenant_id,
        user_id,
        plan_id,
        stripe_subscription_id,
        sub.id,
    )
    return sub


def _session_attr(session: Any, key: str) -> Any:
    if isinstance(session, dict):
        return session.get(key)
    return getattr(session, key, None)


def _session_metadata(session: Any) -> dict[str, str]:
    meta = _session_attr(session, "metadata") or {}
    if hasattr(meta, "to_dict"):
        try:
            meta = dict(meta.to_dict())
        except Exception:
            meta = {}
    if not isinstance(meta, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in meta.items():
        if v is None:
            continue
        out[str(k)] = str(v).strip()
    return out


def _metadata_has_tenant_user_plan(metadata: dict[str, str]) -> bool:
    return bool(
        (metadata.get("tenant_id") or "").strip()
        and (metadata.get("user_id") or "").strip()
        and (metadata.get("plan_id") or "").strip()
    )


def _merge_client_reference_into_metadata(metadata: dict[str, str], session: Any) -> None:
    """Fill tenant/user/plan from client_reference_id ``tenant|user|plan`` when keys are empty."""
    ref = _session_attr(session, "client_reference_id")
    if ref is None:
        return
    s = str(ref).strip()
    if not s or "|" not in s:
        return
    parts = [p.strip() for p in s.split("|", 2)]
    if len(parts) != 3:
        return
    t, u, p = parts
    for key, val in (("tenant_id", t), ("user_id", u), ("plan_id", p)):
        if val and not (metadata.get(key) or "").strip():
            metadata[key] = val


def _merge_checkout_metadata_into(
    target: dict[str, str],
    session_obj: Any,
    *,
    keys: tuple[str, ...] = (
        "tenant_id",
        "user_id",
        "plan_id",
        "promo_code",
        "affiliate_code",
    ),
) -> None:
    sm = _session_metadata(session_obj)
    for k in keys:
        cur = (target.get(k) or "").strip()
        if cur:
            continue
        v = sm.get(k)
        if v and str(v).strip():
            target[k] = str(v).strip()


def enrich_metadata_from_checkout_sessions_for_subscription(
    metadata: dict[str, str],
    stripe_subscription_id: str,
) -> dict[str, str]:
    """Copy tenant/user/plan from Checkout Session when Subscription.metadata is empty (API/webhook quirks)."""
    if _metadata_has_tenant_user_plan(metadata):
        return metadata
    from app.subscriptions.stripe_client import list_checkout_sessions_for_subscription

    listed = list_checkout_sessions_for_subscription(stripe_subscription_id)
    rows = getattr(listed, "data", None) if listed else None
    n = len(rows) if rows else 0
    if not rows:
        logger.warning(
            "No Checkout Sessions found for subscription %s (cannot recover metadata)",
            stripe_subscription_id,
        )
        return metadata
    for sess in rows:
        _merge_checkout_metadata_into(metadata, sess)
        _merge_client_reference_into_metadata(metadata, sess)
        if _metadata_has_tenant_user_plan(metadata):
            logger.info(
                "Recovered checkout metadata from Session %s for subscription %s",
                _session_attr(sess, "id"),
                stripe_subscription_id,
            )
            break
    if not _metadata_has_tenant_user_plan(metadata):
        logger.warning(
            "enrich_metadata: scanned %s Checkout Session(s) for sub=%s but metadata still incomplete keys=%s",
            n,
            stripe_subscription_id,
            sorted(metadata.keys()),
        )
    return metadata


async def fulfill_checkout_session_webhook(
    db: AsyncSession,
    session: Any,
    *,
    retrieve_subscription_fn=None,
    retrieve_checkout_session_fn=None,
) -> bool:
    """Apply checkout.session.completed / async_payment_succeeded. Returns True if provisioned."""
    from app.subscriptions.stripe_client import (
        retrieve_checkout_session as default_retrieve_session,
        retrieve_subscription as default_retrieve_sub,
    )

    retrieve_sub = retrieve_subscription_fn or default_retrieve_sub
    retrieve_sess = retrieve_checkout_session_fn or default_retrieve_session

    checkout_sid = coerce_stripe_expandable_id(_session_attr(session, "id"))
    subscription_id = coerce_stripe_expandable_id(_session_attr(session, "subscription"))
    metadata = _session_metadata(session)
    _merge_client_reference_into_metadata(metadata, session)

    if (not subscription_id or not _metadata_has_tenant_user_plan(metadata)) and checkout_sid:
        full = retrieve_sess(checkout_sid)
        if full:
            session = full
            metadata = _session_metadata(full)
            _merge_client_reference_into_metadata(metadata, full)
            subscription_id = coerce_stripe_expandable_id(_session_attr(full, "subscription"))
        else:
            logger.warning(
                "fulfill: Session.retrieve returned None for checkout_sid=%s "
                "(check STRIPE_SECRET_KEY and Checkout Sessions read permission)",
                checkout_sid,
            )

    if subscription_id and not _metadata_has_tenant_user_plan(metadata):
        metadata = dict(metadata)
        enrich_metadata_from_checkout_sessions_for_subscription(
            metadata, subscription_id
        )
        if not _metadata_has_tenant_user_plan(metadata) and checkout_sid:
            full2 = retrieve_sess(checkout_sid)
            if full2:
                _merge_checkout_metadata_into(metadata, full2)
                _merge_client_reference_into_metadata(metadata, full2)

    tenant_s = metadata.get("tenant_id")
    user_s = metadata.get("user_id")
    plan_s = metadata.get("plan_id")
    if not (tenant_s and user_s and plan_s):
        logger.warning(
            "Stripe checkout fulfillment skipped: missing metadata session_id=%s keys=%s sub=%s",
            _session_attr(session, "id"),
            list(metadata.keys()),
            subscription_id,
        )
        return False

    try:
        tenant_id = UUID(tenant_s)
        user_id = UUID(user_s)
        plan_id = UUID(plan_s)
    except (ValueError, TypeError):
        logger.warning(
            "Stripe checkout fulfillment skipped: bad UUIDs in metadata session_id=%s",
            _session_attr(session, "id"),
        )
        return False

    if not subscription_id:
        logger.warning(
            "Stripe checkout fulfillment skipped: no subscription on session_id=%s",
            _session_attr(session, "id"),
        )
        return False

    customer_id = coerce_stripe_expandable_id(_session_attr(session, "customer"))
    row_checkout_sid = coerce_stripe_expandable_id(_session_attr(session, "id"))

    await upsert_subscription_from_stripe_checkout(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        plan_id=plan_id,
        stripe_subscription_id=subscription_id,
        stripe_customer_id=customer_id,
        provider_checkout_session_id=row_checkout_sid,
        promo_code=_norm_code(metadata.get("promo_code")),
        affiliate_code=_norm_code(metadata.get("affiliate_code")),
        retrieve_subscription_fn=retrieve_sub,
    )
    return True


async def ensure_subscription_from_stripe_subscription_id(
    db: AsyncSession,
    stripe_subscription_id: str,
    *,
    retrieve_subscription_fn=None,
) -> Subscription | None:
    """If invoice.paid arrived before checkout webhook, create Subscription from Stripe metadata."""
    from app.subscriptions.stripe_client import retrieve_subscription as default_retrieve

    retrieve = retrieve_subscription_fn or default_retrieve
    repo = SubscriptionRepository(db)
    existing = await repo.get_by_stripe_id(stripe_subscription_id)
    if existing:
        return existing

    stripe_sub = retrieve(stripe_subscription_id)
    if not stripe_sub:
        logger.warning(
            "ensure_subscription: Stripe.Subscription.retrieve returned nothing for %s",
            stripe_subscription_id,
        )
        return None

    meta = getattr(stripe_sub, "metadata", None) or {}
    if hasattr(meta, "to_dict"):
        try:
            meta = dict(meta.to_dict())
        except Exception:
            meta = {}
    if not isinstance(meta, dict):
        logger.warning(
            "ensure_subscription: subscription %s metadata not a dict after normalize",
            stripe_subscription_id,
        )
        return None
    meta_str: dict[str, str] = {}
    for k, v in meta.items():
        if v is None:
            continue
        meta_str[str(k)] = str(v).strip()
    meta = enrich_metadata_from_checkout_sessions_for_subscription(
        meta_str, stripe_subscription_id
    )
    tenant_s = meta.get("tenant_id")
    user_s = meta.get("user_id")
    plan_s = meta.get("plan_id")
    if not (tenant_s and user_s and plan_s):
        logger.warning(
            "ensure_subscription: subscription %s missing tenant_id/user_id/plan_id after "
            "subscription + checkout session lookup keys=%s",
            stripe_subscription_id,
            list(meta.keys()),
        )
        return None

    try:
        tenant_id = UUID(str(tenant_s).strip())
        user_id = UUID(str(user_s).strip())
        plan_id = UUID(str(plan_s).strip())
    except (ValueError, TypeError):
        return None

    customer_id = coerce_stripe_expandable_id(getattr(stripe_sub, "customer", None))
    promo = _norm_code(meta.get("promo_code"))
    aff = _norm_code(meta.get("affiliate_code"))

    return await upsert_subscription_from_stripe_checkout(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        plan_id=plan_id,
        stripe_subscription_id=stripe_subscription_id,
        stripe_customer_id=customer_id,
        provider_checkout_session_id=None,
        promo_code=promo,
        affiliate_code=aff,
        retrieve_subscription_fn=retrieve,
    )
