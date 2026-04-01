"""Subscription router."""

import hashlib
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.pagination import Paginated
from app.dependencies import get_current_identity, get_tenant_context, require_identity, CurrentIdentity, TenantContext
from app.subscriptions.models import BillingWebhookEvent, Subscription

from .stripe_reconcile import run_stripe_reconcile_for_tenant
from .provider_catalog import list_billing_provider_options
from .schemas import (
    BillingProviderOptionResponse,
    CheckoutRequest,
    CheckoutResponse,
    InvoiceResponse,
    SubscriptionListResponse,
    SubscriptionResponse,
)
from .service import SubscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()


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
    result, err_detail, err_status = await service.create_checkout(identity, tenant_ctx, data)
    if err_detail:
        raise HTTPException(status_code=err_status or status.HTTP_400_BAD_REQUEST, detail=err_detail)
    return result


@router.get("/billing-providers", response_model=list[BillingProviderOptionResponse])
async def list_billing_providers():
    """Known payment providers and whether each can start subscription checkout."""
    return [
        BillingProviderOptionResponse(
            key=o.key,
            label=o.label,
            description=o.description,
            configured=o.configured,
            available_for_checkout=o.available_for_checkout,
        )
        for o in list_billing_provider_options()
    ]


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


@router.get("/invoices", response_model=Paginated[InvoiceResponse])
async def list_tenant_invoices(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """List all subscription invoices for the current tenant (billing history)."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = SubscriptionService(db)
    items, total = await service.list_invoices_for_tenant(
        identity, tenant_ctx, skip=skip, limit=limit
    )
    return Paginated[InvoiceResponse](
        items=items, total=total, skip=skip, limit=limit
    )


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
    from app.subscriptions.stripe_client import (
        construct_webhook_event,
        retrieve_subscription,
    )

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

    # Stripe Connect: events include ``account`` (connected account id)
    if getattr(event, "account", None):
        from app.member_billing.webhooks import handle_member_billing_stripe_event

        await handle_member_billing_stripe_event(db, event)
        try:
            db.add(
                BillingWebhookEvent(
                    provider="stripe",
                    event_id=event_id,
                    event_type=event.type,
                )
            )
            await db.commit()
        except IntegrityError:
            await db.rollback()
            return {"received": True, "duplicate": True}
        return {"received": True, "connect": True}

    if event.type in (
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    ):
        from app.subscriptions.stripe_checkout_fulfillment import fulfill_checkout_session_webhook

        session = event.data.object
        try:
            await fulfill_checkout_session_webhook(
                db,
                session,
                retrieve_subscription_fn=retrieve_subscription,
            )
        except IntegrityError:
            await db.rollback()
            logger.exception(
                "Stripe checkout fulfillment hit DB constraint (e.g. unknown plan_id in metadata). "
                "session_id=%s",
                getattr(session, "id", None),
            )
        except Exception:
            await db.rollback()
            logger.exception(
                "Stripe checkout fulfillment failed (see traceback). session_id=%s",
                getattr(session, "id", None),
            )

    elif event.type == "customer.subscription.created":
        # Fallback when checkout.session.completed errors; metadata lives on the Subscription.
        stripe_sub = event.data.object
        from app.subscriptions.stripe_checkout_fulfillment import (
            coerce_stripe_expandable_id,
            ensure_subscription_from_stripe_subscription_id,
        )

        sid = coerce_stripe_expandable_id(getattr(stripe_sub, "id", None))
        if sid:
            try:
                await ensure_subscription_from_stripe_subscription_id(
                    db,
                    sid,
                    retrieve_subscription_fn=retrieve_subscription,
                )
            except IntegrityError:
                await db.rollback()
                logger.exception(
                    "customer.subscription.created provisioning hit DB constraint sub=%s",
                    sid,
                )
            except Exception:
                await db.rollback()
                logger.exception(
                    "customer.subscription.created provisioning failed sub=%s",
                    sid,
                )

    elif event.type in ("customer.subscription.updated", "customer.subscription.deleted"):
        stripe_sub = event.data.object
        from app.subscriptions.stripe_subscription_sync import sync_local_subscription_from_stripe_payload

        await sync_local_subscription_from_stripe_payload(db, stripe_sub)

    elif event.type in ("invoice.paid", "invoice.payment_succeeded"):
        stripe_invoice = event.data.object
        from app.subscriptions.stripe_invoice_sync import apply_paid_stripe_invoice

        run_growth = event.type == "invoice.paid"
        try:
            await apply_paid_stripe_invoice(
                db,
                stripe_invoice,
                event_id=event_id,
                retrieve_subscription_fn=retrieve_subscription,
                run_growth=run_growth,
            )
        except IntegrityError:
            await db.rollback()
            logger.exception(
                "Stripe invoice webhook hit DB constraint event=%s inv=%s",
                event.type,
                getattr(stripe_invoice, "id", None),
            )
        except Exception:
            await db.rollback()
            logger.exception(
                "Stripe invoice webhook failed event=%s inv=%s",
                event.type,
                getattr(stripe_invoice, "id", None),
            )

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
    _ensure_super_admin(identity)
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    max_items = max(1, min(max_items, 1000))
    counts = await run_stripe_reconcile_for_tenant(
        db, tenant_ctx.tenant_id, max_items=max_items
    )
    await db.flush()
    return counts


@router.get("/{id}/invoices", response_model=Paginated[InvoiceResponse])
async def list_invoices(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    items, total = await service.list_invoices(
        id, identity, tenant_ctx, skip=skip, limit=limit
    )
    return Paginated[InvoiceResponse](
        items=items, total=total, skip=skip, limit=limit
    )
