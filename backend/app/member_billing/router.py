"""Tenant member billing (Stripe Connect) API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity

from .repository import MemberBillingRepository
from .schemas import (
    AccountLinkResponse,
    AdminPaymentLinkRequest,
    AnalyticsSummary,
    CheckoutRequest,
    CheckoutResponse,
    ConnectStatusResponse,
    GuardianMemberStatusOut,
    MemberBillingIntegrationsSummary,
    MemberBillingSettingsUpdate,
    MemberInvoiceOut,
    MemberProductCreate,
    MemberProductOut,
    MemberProductUpdate,
    MemberPurchaseOut,
    MemberSubscriptionCancelRequest,
    MemberSubscriptionOut,
)
from .providers import PayPalMemberMarketplaceProvider
from .service import MemberBillingService

router = APIRouter()


def _tenant(request: Request) -> TenantContext:
    t = getattr(request.state, "tenant", None)
    if t is None:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    return t


@router.get("/integrations/summary", response_model=MemberBillingIntegrationsSummary)
async def integrations_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "view"),
):
    return await MemberBillingService(db).integrations_summary(_tenant(request))


@router.get("/connect/status", response_model=ConnectStatusResponse)
async def connect_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).connect_status(_tenant(request))


@router.patch("/settings", response_model=ConnectStatusResponse)
async def patch_settings(
    data: MemberBillingSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).update_settings(_tenant(request), data)


@router.post("/connect/sync", response_model=ConnectStatusResponse)
async def sync_connect(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).sync_connect_account(_tenant(request))


@router.post("/connect/onboarding", response_model=AccountLinkResponse)
async def start_onboarding(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).start_connect_onboarding(_tenant(request))


@router.post("/products", response_model=MemberProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: MemberProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).create_product(_tenant(request), data)


@router.get("/products", response_model=list[MemberProductOut])
async def list_products_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).list_products(_tenant(request))


@router.patch("/products/{product_id}", response_model=MemberProductOut)
async def update_product(
    product_id: uuid.UUID,
    data: MemberProductUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).update_product(_tenant(request), product_id, data)


@router.get("/pay/catalog", response_model=list[MemberProductOut])
async def pay_catalog(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    tenant = _tenant(request)
    svc = MemberBillingService(db)
    t = await MemberBillingRepository(db).get_tenant(tenant.tenant_id)
    if not t or not t.member_billing_enabled:
        raise HTTPException(status_code=403, detail="Member billing is not enabled")
    products = await svc.list_products(tenant)
    return [p for p in products if p.active]


@router.post("/checkout", response_model=CheckoutResponse)
async def member_checkout(
    body: CheckoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    return await MemberBillingService(db).create_checkout(_tenant(request), identity, body)


@router.post("/admin/payment-link", response_model=CheckoutResponse)
async def admin_member_payment_link(
    body: AdminPaymentLinkRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).create_admin_payment_link(_tenant(request), body)


@router.get("/subscriptions", response_model=list[MemberSubscriptionOut])
async def list_subscriptions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "view"),
):
    tenant = _tenant(request)
    rows = await MemberBillingRepository(db).list_subscriptions(tenant.tenant_id)
    return [MemberSubscriptionOut.model_validate(x) for x in rows]


@router.post(
    "/subscriptions/{subscription_id}/cancel",
    response_model=MemberSubscriptionOut,
)
async def cancel_subscription(
    subscription_id: uuid.UUID,
    body: MemberSubscriptionCancelRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "manage"),
):
    return await MemberBillingService(db).cancel_subscription(
        _tenant(request), subscription_id, body
    )


@router.get("/invoices", response_model=list[MemberInvoiceOut])
async def list_invoices_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("member_billing", "view"),
):
    tenant = _tenant(request)
    rows = await MemberBillingRepository(db).list_invoices(tenant.tenant_id)
    return [MemberInvoiceOut.model_validate(x) for x in rows]


@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=366),
    _: None = require_permission("member_billing", "view"),
):
    return await MemberBillingService(db).analytics(_tenant(request), days=days)


@router.get("/me/invoices", response_model=list[MemberInvoiceOut])
async def my_invoices(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    if identity.sub_type != "user":
        raise HTTPException(status_code=403, detail="User session required")
    tenant = _tenant(request)
    rows = await MemberBillingRepository(db).list_invoices_for_payer(tenant.tenant_id, identity.id)
    return [MemberInvoiceOut.model_validate(x) for x in rows]


@router.get("/me/guardian-status", response_model=GuardianMemberStatusOut)
async def guardian_member_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Stripe membership state per linked child; for parent sidebar / pay CTA logic."""
    return await MemberBillingService(db).guardian_member_status(_tenant(request), identity)


@router.get("/me/purchases", response_model=list[MemberPurchaseOut])
async def my_purchases(
    student_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    from app.students.parent_access import ensure_can_view_student_as_guardian

    tenant = _tenant(request)
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    rows = await MemberBillingRepository(db).list_purchases_for_student(tenant.tenant_id, student_id)
    return [MemberPurchaseOut.model_validate(x) for x in rows]


@router.post("/paypal/checkout", status_code=501)
async def paypal_checkout_stub():
    raise HTTPException(
        status_code=501,
        detail=(
            f"PayPal ({PayPalMemberMarketplaceProvider.provider_id}) member billing is not implemented yet. "
            "Use Stripe Connect."
        ),
    )
