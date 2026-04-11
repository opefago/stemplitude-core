"""Apply Stripe Checkout completion to member billing rows (webhook + reconciliation)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.tenants.models import Tenant

from .models import MemberInvoice, MemberPurchase, MemberSubscription
from .repository import MemberBillingRepository
from .stripe_connect import retrieve_checkout_session, retrieve_invoice, retrieve_subscription

logger = logging.getLogger(__name__)


def _ts(v: Any) -> datetime | None:
    if v is None:
        return None
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def meta_dict(session_obj: Any) -> dict[str, str]:
    m = getattr(session_obj, "metadata", None) or {}
    if hasattr(m, "to_dict"):
        return dict(m.to_dict())
    if isinstance(m, dict):
        return {str(k): str(v) for k, v in m.items()}
    return {}


def _payment_intent_id_from_session(session: Any) -> str | None:
    pi = getattr(session, "payment_intent", None)
    if pi is None:
        return None
    if isinstance(pi, str):
        return pi
    rid = getattr(pi, "id", None)
    return str(rid) if rid else None


async def ensure_member_invoice_for_one_time_purchase(
    db: AsyncSession,
    repo: MemberBillingRepository,
    *,
    mp: MemberPurchase,
    session: Any,
    connected_account_id: str,
) -> None:
    """Upsert a paid receipt row for one-time Checkout (idempotent)."""
    paid_at = mp.paid_at or datetime.now(timezone.utc)
    stripe_inv_raw = getattr(session, "invoice", None)
    stripe_invoice_id = str(stripe_inv_raw) if stripe_inv_raw else None
    receipt_url = getattr(session, "receipt_url", None)
    hosted = receipt_url if isinstance(receipt_url, str) else None
    pdf: str | None = None
    amount_total = int(getattr(session, "amount_total", 0) or 0) or mp.amount_cents
    currency = str(getattr(session, "currency", None) or mp.currency or "usd").lower()

    if stripe_invoice_id:
        inv_obj = retrieve_invoice(stripe_invoice_id, connected_account_id=connected_account_id)
        if inv_obj:
            hu = getattr(inv_obj, "hosted_invoice_url", None)
            if isinstance(hu, str) and hu.strip():
                hosted = hu.strip()
            ip = getattr(inv_obj, "invoice_pdf", None)
            if isinstance(ip, str) and ip.strip():
                pdf = ip.strip()

    existing = await repo.get_invoice_by_member_purchase_id(mp.id)
    if existing:
        changed = False
        if stripe_invoice_id and existing.stripe_invoice_id != stripe_invoice_id:
            conflict = await repo.get_invoice_by_stripe_id(stripe_invoice_id)
            if conflict is None:
                existing.stripe_invoice_id = stripe_invoice_id
                changed = True
        if hosted and not (existing.hosted_invoice_url or "").strip():
            existing.hosted_invoice_url = hosted
            changed = True
        if pdf and not (existing.invoice_pdf or "").strip():
            existing.invoice_pdf = pdf
            changed = True
        if existing.amount_cents != amount_total:
            existing.amount_cents = amount_total
            changed = True
        if existing.currency != currency:
            existing.currency = currency
            changed = True
        if existing.paid_at != paid_at:
            existing.paid_at = paid_at
            changed = True
        if changed:
            await db.flush()
        return

    if stripe_invoice_id:
        by_stripe = await repo.get_invoice_by_stripe_id(stripe_invoice_id)
        if by_stripe:
            if by_stripe.member_purchase_id is None:
                by_stripe.member_purchase_id = mp.id
            if not by_stripe.hosted_invoice_url and hosted:
                by_stripe.hosted_invoice_url = hosted
            if not by_stripe.invoice_pdf and pdf:
                by_stripe.invoice_pdf = pdf
            await db.flush()
            return

    db.add(
        MemberInvoice(
            tenant_id=mp.tenant_id,
            member_subscription_id=None,
            member_purchase_id=mp.id,
            stripe_invoice_id=stripe_invoice_id,
            amount_cents=amount_total,
            currency=currency,
            status="paid",
            hosted_invoice_url=hosted,
            invoice_pdf=pdf,
            period_start=None,
            period_end=None,
            paid_at=paid_at,
        )
    )
    await db.flush()


async def apply_member_checkout_session_completion(
    db: AsyncSession,
    *,
    session: Any,
    connected_account_id: str,
) -> bool:
    """
    If the Checkout Session is complete and tagged for member billing, upsert subscription/purchase state.
    Mirrors ``checkout.session.completed`` webhook handling. Idempotent for already-finalized rows.
    """
    if (getattr(session, "status", None) or "") != "complete":
        return False

    md = meta_dict(session)
    if md.get("member_billing") != "1":
        return False

    tenant_id = uuid.UUID(md["tenant_id"])
    student_id = uuid.UUID(md["student_id"])
    product_id = uuid.UUID(md["product_id"])
    payer_raw = (md.get("payer_user_id") or "").strip()
    payer_user_id = uuid.UUID(payer_raw) if payer_raw else None
    mode = getattr(session, "mode", None) or md.get("mode")
    session_id = getattr(session, "id", None)
    if not session_id:
        return False
    session_id = str(session_id)
    customer = getattr(session, "customer", None)

    repo = MemberBillingRepository(db)

    if mode == "subscription":
        sub_id = getattr(session, "subscription", None)
        q = await db.execute(
            select(MemberSubscription).where(
                MemberSubscription.stripe_checkout_session_id == session_id,
                MemberSubscription.tenant_id == tenant_id,
            )
        )
        ms = q.scalar_one_or_none()
        if not ms:
            ms = await repo.get_incomplete_subscription_for_student_product(
                tenant_id, student_id, product_id
            )
        if not ms:
            ms = MemberSubscription(
                tenant_id=tenant_id,
                product_id=product_id,
                student_id=student_id,
                payer_user_id=payer_user_id,
                status="incomplete",
                stripe_checkout_session_id=session_id,
            )
            db.add(ms)
            await db.flush()
        ms.stripe_checkout_session_id = session_id
        if payer_user_id is not None:
            ms.payer_user_id = payer_user_id
        ms.stripe_customer_id = customer
        ms.stripe_subscription_id = sub_id
        ms.status = "active"
        if sub_id:
            stripe_sub = retrieve_subscription(str(sub_id), connected_account_id=str(connected_account_id))
            if stripe_sub:
                ms.status = getattr(stripe_sub, "status", "active") or "active"
                ms.current_period_start = _ts(getattr(stripe_sub, "current_period_start", None))
                ms.current_period_end = _ts(getattr(stripe_sub, "current_period_end", None))
        await db.flush()
        return True

    q = await db.execute(
        select(MemberPurchase).where(
            MemberPurchase.stripe_checkout_session_id == session_id,
            MemberPurchase.tenant_id == tenant_id,
        )
    )
    mp = q.scalar_one_or_none()
    if mp and mp.paid_at is not None:
        await ensure_member_invoice_for_one_time_purchase(
            db,
            repo,
            mp=mp,
            session=session,
            connected_account_id=connected_account_id,
        )
        return False
    if not mp:
        p = await repo.get_product(product_id, tenant_id)
        amt = p.amount_cents if p else int(getattr(session, "amount_total", 0) or 0)
        cur = p.currency if p else (getattr(session, "currency", None) or "usd")
        mp = MemberPurchase(
            tenant_id=tenant_id,
            product_id=product_id,
            student_id=student_id,
            payer_user_id=payer_user_id,
            stripe_checkout_session_id=session_id,
            amount_cents=amt,
            currency=str(cur).lower(),
        )
        db.add(mp)
        await db.flush()
    pi_id = _payment_intent_id_from_session(session)
    if pi_id:
        mp.stripe_payment_intent_id = pi_id
    mp.paid_at = datetime.now(timezone.utc)
    await db.flush()
    await ensure_member_invoice_for_one_time_purchase(
        db,
        repo,
        mp=mp,
        session=session,
        connected_account_id=connected_account_id,
    )
    return True


async def reconcile_stale_member_checkouts(
    db: AsyncSession,
    *,
    min_age_minutes: int = 2,
    max_age_days: int = 14,
    batch_limit: int = 40,
) -> dict[str, int]:
    """
    Poll Stripe for Checkout Sessions still marked incomplete/unpaid locally (webhook safety net).
    Skips rows newer than ``min_age_minutes`` so the normal webhook usually wins.
    """
    out = {"candidates": 0, "updated": 0, "skipped_no_stripe": 0, "errors": 0}
    if not settings.STRIPE_SECRET_KEY:
        out["skipped_no_stripe"] = 1
        return out

    now = datetime.now(timezone.utc)
    newest = now - timedelta(minutes=min_age_minutes)
    oldest = now - timedelta(days=max_age_days)

    sub_rows = await MemberBillingRepository(db).list_incomplete_subscriptions_for_checkout_reconcile(
        created_after=oldest,
        created_before=newest,
        limit=batch_limit // 2 + 10,
    )
    pur_rows = await MemberBillingRepository(db).list_unpaid_purchases_for_checkout_reconcile(
        created_after=oldest,
        created_before=newest,
        limit=batch_limit // 2 + 10,
    )

    seen_sessions: set[str] = set()

    async def _one(session_id: str, tenant_id: uuid.UUID) -> None:
        nonlocal out
        if session_id in seen_sessions:
            return
        if len(seen_sessions) >= batch_limit:
            return
        seen_sessions.add(session_id)
        out["candidates"] += 1
        try:
            t = await db.get(Tenant, tenant_id)
            if not t or not t.stripe_connect_account_id:
                return
            stripe_sess = retrieve_checkout_session(
                session_id, connected_account_id=t.stripe_connect_account_id
            )
            if not stripe_sess:
                return
            if getattr(stripe_sess, "status", None) != "complete":
                return
            if await apply_member_checkout_session_completion(
                db,
                session=stripe_sess,
                connected_account_id=t.stripe_connect_account_id,
            ):
                out["updated"] += 1
                await db.commit()
        except Exception:
            out["errors"] += 1
            logger.exception("reconcile checkout session_id=%s", session_id)
            await db.rollback()

    for ms in sub_rows:
        if not ms.stripe_checkout_session_id:
            continue
        await _one(ms.stripe_checkout_session_id, ms.tenant_id)

    for mp in pur_rows:
        if not mp.stripe_checkout_session_id:
            continue
        await _one(mp.stripe_checkout_session_id, mp.tenant_id)

    return out
