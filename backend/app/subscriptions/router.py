"""Subscription router."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_identity, get_tenant_context, require_identity, CurrentIdentity, TenantContext

from .schemas import CheckoutRequest, CheckoutResponse, InvoiceResponse, SubscriptionListResponse, SubscriptionResponse
from .service import SubscriptionService

router = APIRouter()


def _get_identity(request: Request) -> CurrentIdentity:
    return require_identity(request)


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
    from datetime import datetime, timezone

    from app.subscriptions.models import Invoice, Subscription
    from app.subscriptions.stripe_client import construct_webhook_event

    body = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    event = construct_webhook_event(body, stripe_signature)
    if not event:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    if event.type == "checkout.session.completed":
        session = event.data.object
        metadata = getattr(session, "metadata", None) or {}
        tenant_id = metadata.get("tenant_id")
        user_id = metadata.get("user_id")
        plan_id = metadata.get("plan_id")
        subscription_id = getattr(session, "subscription", None)

        if tenant_id and user_id and plan_id and subscription_id:
            from uuid import UUID

            sub = Subscription(
                tenant_id=UUID(tenant_id),
                user_id=UUID(user_id),
                plan_id=UUID(plan_id),
                status="active",
                stripe_subscription_id=subscription_id,
                stripe_customer_id=getattr(session, "customer", None),
            )
            db.add(sub)
            await db.flush()

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

    elif event.type == "invoice.paid":
        stripe_invoice = event.data.object
        subscription_id = getattr(stripe_invoice, "subscription", None)
        if subscription_id:
            from app.subscriptions.repository import SubscriptionRepository

            repo = SubscriptionRepository(db)
            sub = await repo.get_by_stripe_id(subscription_id)
            if sub:
                inv = Invoice(
                    subscription_id=sub.id,
                    stripe_invoice_id=getattr(stripe_invoice, "id", None),
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

    return {"received": True}


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
