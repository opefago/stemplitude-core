"""Subscription router."""

import hashlib
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_identity, get_tenant_context, require_identity, CurrentIdentity, TenantContext
from app.licenses.models import License, LicenseFeature, LicenseLimit, SeatUsage
from app.plans.models import Plan
from app.subscriptions.models import BillingWebhookEvent, Invoice, Subscription

from .schemas import CheckoutRequest, CheckoutResponse, InvoiceResponse, SubscriptionListResponse, SubscriptionResponse
from .service import SubscriptionService

router = APIRouter()

ACTIVE_SUB_STATUSES = {"active", "trialing", "past_due"}


def _normalize_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _license_status_for_subscription(subscription_status: str) -> str:
    return "active" if subscription_status in ACTIVE_SUB_STATUSES else "inactive"


def _seat_limits_from_plan(plan: Plan) -> dict[str, int]:
    limits = {row.limit_key: int(row.limit_value) for row in plan.limits}
    seat_limits: dict[str, int] = {}
    if "max_students" in limits:
        seat_limits["student"] = limits["max_students"]
    if "max_instructors" in limits:
        seat_limits["instructor"] = limits["max_instructors"]
    return seat_limits


async def _sync_license_from_subscription(db: AsyncSession, subscription: Subscription) -> None:
    plan_result = await db.execute(
        select(Plan)
        .where(Plan.id == subscription.plan_id)
        .options(
            selectinload(Plan.features),
            selectinload(Plan.limits),
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return

    license_result = await db.execute(
        select(License).where(License.subscription_id == subscription.id)
    )
    license_ = license_result.scalar_one_or_none()
    valid_until = subscription.current_period_end.date() if subscription.current_period_end else None
    next_status = _license_status_for_subscription(subscription.status)

    if not license_:
        license_ = License(
            subscription_id=subscription.id,
            tenant_id=subscription.tenant_id,
            user_id=subscription.user_id,
            status=next_status,
            valid_from=date.today(),
            valid_until=valid_until,
        )
        db.add(license_)
        await db.flush()
    else:
        license_.tenant_id = subscription.tenant_id
        license_.user_id = subscription.user_id
        license_.status = next_status
        if valid_until:
            license_.valid_until = valid_until

    await db.execute(
        LicenseFeature.__table__.delete().where(LicenseFeature.license_id == license_.id)
    )
    await db.execute(
        LicenseLimit.__table__.delete().where(LicenseLimit.license_id == license_.id)
    )
    await db.execute(
        SeatUsage.__table__.delete().where(SeatUsage.license_id == license_.id)
    )

    for feature in plan.features:
        db.add(
            LicenseFeature(
                license_id=license_.id,
                feature_key=feature.feature_key,
                enabled=bool(feature.enabled),
            )
        )
    for limit in plan.limits:
        db.add(
            LicenseLimit(
                license_id=license_.id,
                limit_key=limit.limit_key,
                limit_value=int(limit.limit_value),
            )
        )
    for seat_type, max_count in _seat_limits_from_plan(plan).items():
        db.add(
            SeatUsage(
                license_id=license_.id,
                tenant_id=subscription.tenant_id,
                seat_type=seat_type,
                current_count=0,
                max_count=max_count,
            )
        )


def _get_identity(request: Request) -> CurrentIdentity:
    return require_identity(request)


def _ensure_super_admin(identity: CurrentIdentity) -> None:
    if not identity.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    data: CheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Create a Stripe checkout session for subscription."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    result = await service.create_checkout(identity, tenant_ctx, data)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create checkout session. Check plan and Stripe configuration.",
        )
    return result


@router.get("/", response_model=SubscriptionListResponse)
async def list_subscriptions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """List subscriptions for the current tenant."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    items, total = await service.list_subscriptions(identity, tenant_ctx, skip=skip, limit=limit)
    return SubscriptionListResponse(items=items, total=total)


@router.get("/{id}", response_model=SubscriptionResponse)
async def get_subscription(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Get subscription by ID."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    sub = await service.get_subscription(id, identity, tenant_ctx)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return sub


@router.post("/{id}/cancel", response_model=SubscriptionResponse)
async def cancel_subscription(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Cancel subscription at period end."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    sub = await service.cancel_subscription(id, identity, tenant_ctx)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return sub


@router.post("/{id}/reactivate", response_model=SubscriptionResponse)
async def reactivate_subscription(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Reactivate a subscription set to cancel."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    sub = await service.reactivate_subscription(id, identity, tenant_ctx)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return sub


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
):
    """Handle Stripe webhook events. No auth - verified by Stripe signature."""
    from app.growth.router import process_paid_invoice_for_growth
    from app.subscriptions.stripe_client import construct_webhook_event, retrieve_subscription

    body = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    event = construct_webhook_event(body, stripe_signature)
    if not event:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")
    event_id = getattr(event, "id", None) or f"stripe:{hashlib.sha256(body).hexdigest()}"

    existing_event = await db.execute(
        select(BillingWebhookEvent).where(
            BillingWebhookEvent.provider == "stripe",
            BillingWebhookEvent.event_id == event_id,
        )
    )
    if existing_event.scalar_one_or_none():
        return {"received": True, "duplicate": True}

    if event.type == "checkout.session.completed":
        session = event.data.object
        metadata = getattr(session, "metadata", None) or {}
        tenant_id = metadata.get("tenant_id")
        user_id = metadata.get("user_id")
        plan_id = metadata.get("plan_id")
        promo_code = _normalize_code(metadata.get("promo_code"))
        affiliate_code = _normalize_code(metadata.get("affiliate_code"))
        subscription_id = getattr(session, "subscription", None)
        subscription_status = "active"

        if tenant_id and user_id and plan_id and subscription_id:
            from uuid import UUID

            from app.subscriptions.repository import SubscriptionRepository

            repo = SubscriptionRepository(db)
            sub = await repo.get_by_stripe_id(subscription_id)
            stripe_sub = retrieve_subscription(subscription_id)
            if stripe_sub:
                subscription_status = getattr(stripe_sub, "status", None) or "active"
            if not sub:
                sub = Subscription(
                    tenant_id=UUID(tenant_id),
                    user_id=UUID(user_id),
                    plan_id=UUID(plan_id),
                    status=subscription_status,
                    provider="stripe",
                    provider_subscription_id=subscription_id,
                    provider_customer_id=getattr(session, "customer", None),
                    provider_checkout_session_id=getattr(session, "id", None),
                    stripe_subscription_id=subscription_id,
                    stripe_customer_id=getattr(session, "customer", None),
                    promo_code=promo_code,
                    affiliate_code=affiliate_code,
                )
                db.add(sub)
                await db.flush()
            else:
                sub.tenant_id = UUID(tenant_id)
                sub.user_id = UUID(user_id)
                sub.plan_id = UUID(plan_id)
                sub.status = subscription_status
                sub.provider = "stripe"
                sub.provider_subscription_id = subscription_id
                sub.provider_customer_id = getattr(session, "customer", None)
                sub.provider_checkout_session_id = getattr(session, "id", None)
                sub.stripe_customer_id = getattr(session, "customer", None)
                sub.promo_code = promo_code
                sub.affiliate_code = affiliate_code
                await db.flush()
            if stripe_sub:
                sub.current_period_start = (
                    datetime.fromtimestamp(stripe_sub.current_period_start, tz=timezone.utc)
                    if getattr(stripe_sub, "current_period_start", None)
                    else sub.current_period_start
                )
                sub.current_period_end = (
                    datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc)
                    if getattr(stripe_sub, "current_period_end", None)
                    else sub.current_period_end
                )
                sub.trial_end = (
                    datetime.fromtimestamp(stripe_sub.trial_end, tz=timezone.utc)
                    if getattr(stripe_sub, "trial_end", None)
                    else sub.trial_end
                )
                await db.flush()
            await _sync_license_from_subscription(db, sub)

    elif event.type in ("customer.subscription.updated", "customer.subscription.deleted"):
        stripe_sub = event.data.object
        from app.subscriptions.repository import SubscriptionRepository

        repo = SubscriptionRepository(db)
        sub = await repo.get_by_stripe_id(stripe_sub.id)
        if sub:
            sub.status = stripe_sub.status
            sub.current_period_start = (
                datetime.fromtimestamp(stripe_sub.current_period_start, tz=timezone.utc)
                if stripe_sub.current_period_start
                else None
            )
            sub.current_period_end = (
                datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc)
                if stripe_sub.current_period_end
                else None
            )
            sub.trial_end = (
                datetime.fromtimestamp(stripe_sub.trial_end, tz=timezone.utc)
                if stripe_sub.trial_end
                else None
            )
            if stripe_sub.canceled_at:
                sub.canceled_at = datetime.fromtimestamp(stripe_sub.canceled_at, tz=timezone.utc)
            await db.flush()
            await _sync_license_from_subscription(db, sub)

    elif event.type == "invoice.paid":
        stripe_invoice = event.data.object
        subscription_id = getattr(stripe_invoice, "subscription", None)
        if subscription_id:
            from app.subscriptions.repository import SubscriptionRepository

            repo = SubscriptionRepository(db)
            sub = await repo.get_by_stripe_id(subscription_id)
            stripe_invoice_id = getattr(stripe_invoice, "id", None)
            existing_invoice = None
            if stripe_invoice_id:
                existing_invoice = await repo.get_invoice_by_stripe_id(stripe_invoice_id)
            if sub and not existing_invoice:
                stripe_sub = retrieve_subscription(subscription_id)
                sub_metadata = getattr(stripe_sub, "metadata", None) if stripe_sub else None
                affiliate_code = None
                if isinstance(sub_metadata, dict):
                    affiliate_code = _normalize_code(sub_metadata.get("affiliate_code"))
                inv = Invoice(
                    subscription_id=sub.id,
                    provider="stripe",
                    provider_invoice_id=stripe_invoice_id,
                    stripe_invoice_id=stripe_invoice_id,
                    amount_cents=getattr(stripe_invoice, "amount_paid", 0) or 0,
                    currency=getattr(stripe_invoice, "currency", "usd") or "usd",
                    status="paid",
                    period_start=(
                        datetime.fromtimestamp(stripe_invoice.period_start, tz=timezone.utc)
                        if getattr(stripe_invoice, "period_start", None)
                        else None
                    ),
                    period_end=(
                        datetime.fromtimestamp(stripe_invoice.period_end, tz=timezone.utc)
                        if getattr(stripe_invoice, "period_end", None)
                        else None
                    ),
                    paid_at=datetime.now(timezone.utc),
                )
                db.add(inv)
                await db.flush()
                await process_paid_invoice_for_growth(
                    db=db,
                    event_id=event_id,
                    tenant_id=str(sub.tenant_id),
                    user_id=str(sub.user_id),
                    subscription_id=str(sub.id),
                    invoice_id=stripe_invoice_id or str(inv.id),
                    amount_cents=inv.amount_cents,
                    currency=inv.currency,
                    promo_code=sub.promo_code,
                    affiliate_code=affiliate_code,
                    paid_at_iso=inv.paid_at.isoformat() if inv.paid_at else None,
                )
                await _sync_license_from_subscription(db, sub)

    try:
        db.add(
            BillingWebhookEvent(
                provider="stripe",
                event_id=event_id,
                event_type=event.type,
            )
        )
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return {"received": True, "duplicate": True}

    return {"received": True}


@router.post("/reconcile/stripe")
async def reconcile_stripe_subscriptions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    max_items: int = 200,
):
    """Manually reconcile local subscriptions with Stripe for a tenant."""
    from app.subscriptions.stripe_client import retrieve_subscription

    _ensure_super_admin(identity)
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    max_items = max(1, min(max_items, 1000))
    subs_result = await db.execute(
        select(Subscription)
        .where(
            Subscription.tenant_id == tenant_ctx.tenant_id,
            Subscription.stripe_subscription_id.is_not(None),
        )
        .order_by(Subscription.created_at.desc())
        .limit(max_items)
    )
    subs = list(subs_result.scalars().all())
    updated = 0
    skipped = 0
    for sub in subs:
        stripe_sub = retrieve_subscription(sub.stripe_subscription_id or "")
        if not stripe_sub:
            skipped += 1
            continue
        sub.status = stripe_sub.status
        sub.current_period_start = (
            datetime.fromtimestamp(stripe_sub.current_period_start, tz=timezone.utc)
            if getattr(stripe_sub, "current_period_start", None)
            else None
        )
        sub.current_period_end = (
            datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc)
            if getattr(stripe_sub, "current_period_end", None)
            else None
        )
        sub.trial_end = (
            datetime.fromtimestamp(stripe_sub.trial_end, tz=timezone.utc)
            if getattr(stripe_sub, "trial_end", None)
            else None
        )
        if getattr(stripe_sub, "canceled_at", None):
            sub.canceled_at = datetime.fromtimestamp(stripe_sub.canceled_at, tz=timezone.utc)
        await _sync_license_from_subscription(db, sub)
        updated += 1
    await db.flush()
    return {"updated": updated, "skipped": skipped, "total": len(subs)}


@router.get("/{id}/invoices", response_model=list[InvoiceResponse])
async def list_invoices(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """List invoices for a subscription."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    items, _ = await service.list_invoices(id, identity, tenant_ctx, skip=skip, limit=limit)
    return items
