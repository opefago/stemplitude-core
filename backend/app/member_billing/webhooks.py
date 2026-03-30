"""Stripe Connect webhook handling (events with ``event.account`` set)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification
from app.tenants.models import Tenant
from app.users.models import User

from .checkout_completion import apply_member_checkout_session_completion, meta_dict
from .models import MemberInvoice
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
        if meta_dict(session).get("member_billing") != "1":
            return True
        await apply_member_checkout_session_completion(
            db, session=session, connected_account_id=str(acct)
        )
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
        stripe_invoice_id = getattr(inv, "id", None)
        if not stripe_invoice_id:
            return True
        sid = str(stripe_invoice_id)
        if await repo.get_invoice_by_stripe_id(sid):
            return True
        sub_id = getattr(inv, "subscription", None)
        if sub_id:
            ms = await repo.get_subscription_by_stripe_id(str(sub_id))
            if not ms:
                return True
            hosted = getattr(inv, "hosted_invoice_url", None)
            pdf = getattr(inv, "invoice_pdf", None)
            m_inv = MemberInvoice(
                tenant_id=ms.tenant_id,
                member_subscription_id=ms.id,
                stripe_invoice_id=sid,
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
        pi_raw = getattr(inv, "payment_intent", None)
        pi_id = pi_raw if isinstance(pi_raw, str) else getattr(pi_raw, "id", None)
        if not pi_id:
            return True
        mp = await repo.get_purchase_by_stripe_payment_intent(str(pi_id))
        if not mp or mp.paid_at is None:
            return True
        st = getattr(inv, "status_transitions", None)
        paid_unix = getattr(st, "paid_at", None) if st is not None else None
        paid_at = _ts(paid_unix)
        if paid_at is None:
            paid_at = datetime.now(timezone.utc)
        existing_p = await repo.get_invoice_by_member_purchase_id(mp.id)
        hosted = getattr(inv, "hosted_invoice_url", None)
        pdf = getattr(inv, "invoice_pdf", None)
        if existing_p:
            existing_p.stripe_invoice_id = sid
            if hosted and not (existing_p.hosted_invoice_url or "").strip():
                existing_p.hosted_invoice_url = hosted
            if pdf and not (existing_p.invoice_pdf or "").strip():
                existing_p.invoice_pdf = pdf
            existing_p.amount_cents = int(getattr(inv, "amount_paid", 0) or existing_p.amount_cents)
            existing_p.currency = str(getattr(inv, "currency", existing_p.currency) or "usd").lower()
            existing_p.paid_at = paid_at
            await db.flush()
            return True
        m_inv = MemberInvoice(
            tenant_id=mp.tenant_id,
            member_subscription_id=None,
            member_purchase_id=mp.id,
            stripe_invoice_id=sid,
            amount_cents=int(getattr(inv, "amount_paid", 0) or 0),
            currency=str(getattr(inv, "currency", "usd") or "usd").lower(),
            status="paid",
            hosted_invoice_url=hosted,
            invoice_pdf=pdf,
            period_start=_ts(getattr(inv, "period_start", None)),
            period_end=_ts(getattr(inv, "period_end", None)),
            paid_at=paid_at,
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
