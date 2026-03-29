"""Stripe Connect webhook handling (events with ``event.account`` set)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification
from app.tenants.models import Tenant
from app.users.models import User

from .models import MemberInvoice, MemberPurchase, MemberSubscription
from .repository import MemberBillingRepository
from .stripe_connect import retrieve_account, retrieve_subscription

logger = logging.getLogger(__name__)


def _ts(v: Any) -> datetime | None:
    if v is None:
        return None
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _meta_dict(session_obj: Any) -> dict[str, str]:
    m = getattr(session_obj, "metadata", None) or {}
    if hasattr(m, "to_dict"):
        return dict(m.to_dict())
    if isinstance(m, dict):
        return {str(k): str(v) for k, v in m.items()}
    return {}


async def handle_member_billing_stripe_event(db: AsyncSession, event: Any) -> bool:
    """Process Connect-scoped Stripe events. Returns True if handled here."""
    acct = getattr(event, "account", None)
    if not acct:
        return False

    repo = MemberBillingRepository(db)
    etype = getattr(event, "type", "") or ""

    if etype == "account.updated":
        r = await db.execute(
            select(Tenant).where(Tenant.stripe_connect_account_id == str(acct))
        )
        tenant = r.scalar_one_or_none()
        if tenant:
            a = retrieve_account(str(acct))
            if a:
                tenant.stripe_connect_charges_enabled = bool(getattr(a, "charges_enabled", False))
                tenant.stripe_connect_payouts_enabled = bool(getattr(a, "payouts_enabled", False))
                tenant.stripe_connect_details_submitted = bool(getattr(a, "details_submitted", False))
                await db.flush()
        return True

    if etype == "checkout.session.completed":
        session = event.data.object
        md = _meta_dict(session)
        if md.get("member_billing") != "1":
            return True
        tenant_id = uuid.UUID(md["tenant_id"])
        student_id = uuid.UUID(md["student_id"])
        product_id = uuid.UUID(md["product_id"])
        payer_raw = (md.get("payer_user_id") or "").strip()
        payer_user_id = uuid.UUID(payer_raw) if payer_raw else None
        mode = getattr(session, "mode", None) or md.get("mode")
        session_id = getattr(session, "id", None)
        customer = getattr(session, "customer", None)

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
            ms.stripe_customer_id = customer
            ms.stripe_subscription_id = sub_id
            ms.status = "active"
            if sub_id:
                stripe_sub = retrieve_subscription(str(sub_id), connected_account_id=str(acct))
                if stripe_sub:
                    ms.status = getattr(stripe_sub, "status", "active") or "active"
                    ms.current_period_start = _ts(getattr(stripe_sub, "current_period_start", None))
                    ms.current_period_end = _ts(getattr(stripe_sub, "current_period_end", None))
            await db.flush()
        else:
            q = await db.execute(
                select(MemberPurchase).where(
                    MemberPurchase.stripe_checkout_session_id == session_id,
                    MemberPurchase.tenant_id == tenant_id,
                )
            )
            mp = q.scalar_one_or_none()
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
            mp.paid_at = datetime.now(timezone.utc)
            await db.flush()
        return True

    if etype in ("customer.subscription.updated", "customer.subscription.deleted"):
        stripe_sub = event.data.object
        sid = getattr(stripe_sub, "id", None)
        if not sid:
            return True
        ms = await repo.get_subscription_by_stripe_id(str(sid))
        if ms:
            if etype == "customer.subscription.deleted":
                ms.status = "canceled"
                ms.canceled_at = datetime.now(timezone.utc)
            else:
                ms.status = getattr(stripe_sub, "status", ms.status)
                ms.current_period_start = _ts(getattr(stripe_sub, "current_period_start", None))
                ms.current_period_end = _ts(getattr(stripe_sub, "current_period_end", None))
                ca = getattr(stripe_sub, "canceled_at", None)
                ms.canceled_at = _ts(ca) if ca else ms.canceled_at
            await db.flush()
        return True

    if etype == "invoice.paid":
        inv = event.data.object
        sub_id = getattr(inv, "subscription", None)
        stripe_invoice_id = getattr(inv, "id", None)
        if not sub_id or not stripe_invoice_id:
            return True
        ms = await repo.get_subscription_by_stripe_id(str(sub_id))
        if not ms:
            return True
        existing = await repo.get_invoice_by_stripe_id(str(stripe_invoice_id))
        if existing:
            return True
        hosted = getattr(inv, "hosted_invoice_url", None)
        pdf = getattr(inv, "invoice_pdf", None)
        m_inv = MemberInvoice(
            tenant_id=ms.tenant_id,
            member_subscription_id=ms.id,
            stripe_invoice_id=str(stripe_invoice_id),
            amount_cents=int(getattr(inv, "amount_paid", 0) or 0),
            currency=str(getattr(inv, "currency", "usd") or "usd").lower(),
            status="paid",
            hosted_invoice_url=hosted,
            invoice_pdf=pdf,
            period_start=_ts(getattr(inv, "period_start", None)),
            period_end=_ts(getattr(inv, "period_end", None)),
            paid_at=datetime.now(timezone.utc),
        )
        db.add(m_inv)
        await db.flush()
        return True

    if etype == "invoice.payment_failed":
        inv = event.data.object
        sub_id = getattr(inv, "subscription", None)
        if sub_id:
            ms = await repo.get_subscription_by_stripe_id(str(sub_id))
            if ms:
                ms.status = "past_due"
                await db.flush()
                if ms.payer_user_id:
                    db.add(
                        Notification(
                            user_id=ms.payer_user_id,
                            tenant_id=ms.tenant_id,
                            type="member_billing_payment_failed",
                            title="Payment failed",
                            body="We could not process your membership payment. Please update your payment method.",
                            is_read=False,
                        )
                    )
                    await db.flush()
        return True

    if etype == "invoice.upcoming":
        inv = event.data.object
        sub_id = getattr(inv, "subscription", None)
        if not sub_id:
            return True
        ms = await repo.get_subscription_by_stripe_id(str(sub_id))
        if ms and ms.payer_user_id:
            user = await db.get(User, ms.payer_user_id)
            if user and user.email:
                try:
                    from workers.celery_app import celery_app

                    period_end = _ts(getattr(inv, "period_end", None))
                    body = (
                        "Your membership payment is coming up. "
                        f"Next period ends around {period_end.date().isoformat() if period_end else 'soon'}."
                    )
                    celery_app.send_task(
                        "email.send",
                        kwargs={
                            "recipient": user.email,
                            "subject": "Upcoming membership payment",
                            "body": body,
                            "tenant_id": str(ms.tenant_id),
                            "route_key": "member_billing.upcoming",
                        },
                    )
                except Exception:
                    logger.exception("invoice.upcoming email queue failed")
        return True

    return True
