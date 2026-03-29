from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import CurrentIdentity, TenantContext
from app.students.parent_access import ensure_can_view_student_as_guardian
from app.students.repository import StudentRepository
from app.users.models import User

from .models import MemberBillingProduct, MemberInvoice, MemberPurchase, MemberSubscription
from .repository import MemberBillingRepository
from .schemas import (
    AccountLinkResponse,
    AdminPaymentLinkRequest,
    AnalyticsSummary,
    CheckoutRequest,
    CheckoutResponse,
    ConnectStatusResponse,
    MemberBillingIntegrationsSummary,
    MemberBillingSettingsUpdate,
    MemberProductCreate,
    MemberProductOut,
)
from .platform_fee import resolve_effective_member_billing_application_fee_bps
from .stripe_connect import (
    create_account_link,
    create_express_connected_account,
    create_member_checkout_session,
    ensure_stripe_product_price,
    retrieve_account,
)


class MemberBillingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = MemberBillingRepository(db)

    def _connect_configured(self) -> bool:
        # Express Account Links only need the platform secret key. Optional STRIPE_CONNECT_CLIENT_ID
        # (ca_…) is for OAuth-style flows and shown in the UI when set.
        return bool(settings.STRIPE_SECRET_KEY)

    async def connect_status(self, tenant: TenantContext) -> ConnectStatusResponse:
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return ConnectStatusResponse(
            stripe_connect_account_id=t.stripe_connect_account_id,
            charges_enabled=t.stripe_connect_charges_enabled,
            payouts_enabled=t.stripe_connect_payouts_enabled,
            details_submitted=t.stripe_connect_details_submitted,
            member_billing_enabled=t.member_billing_enabled,
            require_member_billing_for_access=t.require_member_billing_for_access,
            connect_configured=self._connect_configured(),
        )

    async def update_settings(
        self, tenant: TenantContext, data: MemberBillingSettingsUpdate
    ) -> ConnectStatusResponse:
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        if data.member_billing_enabled is not None:
            t.member_billing_enabled = data.member_billing_enabled
        if data.require_member_billing_for_access is not None:
            t.require_member_billing_for_access = data.require_member_billing_for_access
        await self.db.commit()
        await self.db.refresh(t)
        return await self.connect_status(tenant)

    async def sync_connect_account(self, tenant: TenantContext) -> ConnectStatusResponse:
        await self.sync_connect_account_from_stripe(tenant.tenant_id)
        return await self.connect_status(tenant)

    async def start_connect_onboarding(self, tenant: TenantContext) -> AccountLinkResponse:
        if not self._connect_configured():
            raise HTTPException(
                status_code=503,
                detail="Stripe is not configured: set STRIPE_SECRET_KEY for the platform account (test or live).",
            )
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        if not t.stripe_connect_account_id:
            acct = create_express_connected_account(tenant_id=t.id, tenant_name=t.name)
            if not acct:
                raise HTTPException(status_code=502, detail="Could not create Stripe connected account")
            t.stripe_connect_account_id = acct
            await self.db.commit()
            await self.db.refresh(t)
        base = settings.FRONTEND_URL.rstrip("/")
        url = create_account_link(
            account_id=t.stripe_connect_account_id,
            refresh_url=f"{base}/app/settings/member-billing?connect=refresh",
            return_url=f"{base}/app/settings/member-billing?connect=return",
        )
        if not url:
            raise HTTPException(status_code=502, detail="Could not create onboarding link")
        return AccountLinkResponse(url=url)

    async def sync_connect_account_from_stripe(self, tenant_id: uuid.UUID) -> None:
        t = await self.repo.get_tenant(tenant_id)
        if not t or not t.stripe_connect_account_id:
            return
        acct = retrieve_account(t.stripe_connect_account_id)
        if not acct:
            return
        t.stripe_connect_charges_enabled = bool(getattr(acct, "charges_enabled", False))
        t.stripe_connect_payouts_enabled = bool(getattr(acct, "payouts_enabled", False))
        t.stripe_connect_details_submitted = bool(getattr(acct, "details_submitted", False))
        await self.db.commit()

    async def create_product(
        self, tenant: TenantContext, data: MemberProductCreate
    ) -> MemberProductOut:
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t or not t.stripe_connect_account_id:
            raise HTTPException(
                status_code=400,
                detail="Complete Stripe Connect onboarding before creating products.",
            )
        if not t.stripe_connect_charges_enabled:
            raise HTTPException(status_code=400, detail="Connected account cannot charge yet.")
        if data.billing_type == "recurring" and not data.interval:
            raise HTTPException(status_code=400, detail="interval required for recurring products")
        interval_val: str | None = None if data.billing_type == "one_time" else data.interval
        sp, pr = ensure_stripe_product_price(
            connected_account_id=t.stripe_connect_account_id,
            product_name=data.name,
            amount_cents=data.amount_cents,
            currency=data.currency,
            billing_type=data.billing_type,
            interval=interval_val,
        )
        if not pr:
            raise HTTPException(status_code=502, detail="Could not create Stripe price on connected account")
        p = MemberBillingProduct(
            tenant_id=tenant.tenant_id,
            name=data.name,
            description=data.description,
            amount_cents=data.amount_cents,
            currency=data.currency.lower(),
            billing_type=data.billing_type,
            interval=interval_val,
            stripe_product_id=sp,
            stripe_price_id=pr,
        )
        await self.repo.create_product(p)
        await self.db.commit()
        await self.db.refresh(p)
        return MemberProductOut.model_validate(p)

    async def list_products(self, tenant: TenantContext) -> list[MemberProductOut]:
        rows = await self.repo.list_products(tenant.tenant_id)
        return [MemberProductOut.model_validate(x) for x in rows]

    async def integrations_summary(
        self, tenant: TenantContext
    ) -> MemberBillingIntegrationsSummary:
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return MemberBillingIntegrationsSummary(
            platform_stripe_configured=self._connect_configured(),
            connect_account_linked=bool(t.stripe_connect_account_id),
            charges_enabled=bool(t.stripe_connect_charges_enabled),
            member_billing_enabled=bool(t.member_billing_enabled),
            details_submitted=bool(t.stripe_connect_details_submitted),
        )

    async def _ensure_active_student_membership(
        self, student_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> None:
        stu_repo = StudentRepository(self.db)
        m = await stu_repo.get_membership(student_id, tenant_id)
        if not m or not m.is_active:
            raise HTTPException(
                status_code=404,
                detail="Learner is not an active member of this organization.",
            )

    async def _resolve_payer_email_for_member_checkout(
        self,
        *,
        student_id: uuid.UUID,
        tenant_id: uuid.UUID,
        payer_user_id: uuid.UUID | None,
    ) -> tuple[uuid.UUID | None, str]:
        await self._ensure_active_student_membership(student_id, tenant_id)
        stu_repo = StudentRepository(self.db)
        if payer_user_id is not None:
            parents = await stu_repo.list_parents(student_id)
            if not any(p.user_id == payer_user_id for p in parents):
                raise HTTPException(
                    status_code=400,
                    detail="Selected payer is not linked to this learner.",
                )
            user = await self.db.get(User, payer_user_id)
            em = (user.email or "").strip() if user else ""
            if not em:
                raise HTTPException(
                    status_code=400,
                    detail="That guardian account has no email; choose another payer or add an email.",
                )
            return payer_user_id, em
        for link in await stu_repo.list_parents(student_id):
            user = await self.db.get(User, link.user_id)
            em = (user.email or "").strip() if user else ""
            if em:
                return link.user_id, em
        stu = await stu_repo.get_by_id(student_id)
        em = (stu.email or "").strip() if stu else ""
        if em:
            return None, em
        raise HTTPException(
            status_code=400,
            detail=(
                "No billing email found. Link a guardian with an email, or set the learner email, "
                "then try again."
            ),
        )

    async def _persist_checkout_session(
        self,
        tenant_id: uuid.UUID,
        *,
        student_id: uuid.UUID,
        product: MemberBillingProduct,
        payer_user_id: uuid.UUID | None,
        session,
    ) -> CheckoutResponse:
        mode = "subscription" if product.billing_type == "recurring" else "payment"
        if mode == "subscription":
            ms = MemberSubscription(
                tenant_id=tenant_id,
                product_id=product.id,
                student_id=student_id,
                payer_user_id=payer_user_id,
                status="incomplete",
                stripe_checkout_session_id=getattr(session, "id", None),
            )
            self.db.add(ms)
        else:
            mp = MemberPurchase(
                tenant_id=tenant_id,
                product_id=product.id,
                student_id=student_id,
                payer_user_id=payer_user_id,
                stripe_checkout_session_id=getattr(session, "id", None),
                amount_cents=product.amount_cents,
                currency=product.currency,
            )
            self.db.add(mp)
        await self.db.commit()
        return CheckoutResponse(url=session.url)

    async def _create_stripe_checkout_for_member(
        self,
        tenant: TenantContext,
        *,
        student_id: uuid.UUID,
        product: MemberBillingProduct,
        payer_user_id: uuid.UUID | None,
        customer_email: str | None,
    ) -> CheckoutResponse:
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t or not t.member_billing_enabled:
            raise HTTPException(
                status_code=403,
                detail="Member billing is not enabled for this organization",
            )
        if not t.stripe_connect_account_id or not t.stripe_connect_charges_enabled:
            raise HTTPException(status_code=503, detail="Payment collection is not ready yet")
        if not product.active or not product.stripe_price_id:
            raise HTTPException(status_code=404, detail="Product not found")

        mode = "subscription" if product.billing_type == "recurring" else "payment"
        meta = {
            "member_billing": "1",
            "tenant_id": str(tenant.tenant_id),
            "student_id": str(student_id),
            "product_id": str(product.id),
            "payer_user_id": str(payer_user_id) if payer_user_id else "",
        }
        fee_bps = await resolve_effective_member_billing_application_fee_bps(self.db, t)
        fee_percent = fee_bps / 100.0 if fee_bps else None
        fee_amount = (product.amount_cents * fee_bps) // 10000 if mode == "payment" and fee_bps else None
        base = settings.FRONTEND_URL.rstrip("/")
        session = create_member_checkout_session(
            connected_account_id=t.stripe_connect_account_id,
            price_id=product.stripe_price_id,
            mode=mode,
            success_url=f"{base}/app/member-billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/app/member-billing/cancel",
            customer_email=customer_email,
            metadata=meta,
            application_fee_percent=fee_percent,
            application_fee_amount_cents=fee_amount,
        )
        if not session or not getattr(session, "url", None):
            raise HTTPException(status_code=502, detail="Could not start checkout")
        return await self._persist_checkout_session(
            tenant.tenant_id,
            student_id=student_id,
            product=product,
            payer_user_id=payer_user_id,
            session=session,
        )

    async def create_checkout(
        self,
        tenant: TenantContext,
        identity: CurrentIdentity,
        body: CheckoutRequest,
    ) -> CheckoutResponse:
        product = await self.repo.get_product(body.product_id, tenant.tenant_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        await ensure_can_view_student_as_guardian(
            self.db,
            identity=identity,
            student_id=body.student_id,
            tenant_id=tenant.tenant_id,
        )
        payer_user_id: uuid.UUID | None = None
        customer_email: str | None = None
        if identity.sub_type == "student":
            if body.student_id != identity.id:
                raise HTTPException(status_code=403, detail="Invalid student")
            stu_repo = StudentRepository(self.db)
            stu = await stu_repo.get_by_id(body.student_id)
            if stu and stu.email:
                customer_email = stu.email
        else:
            payer_user_id = identity.id
            user = await self.db.get(User, identity.id)
            if user and user.email:
                customer_email = user.email

        return await self._create_stripe_checkout_for_member(
            tenant,
            student_id=body.student_id,
            product=product,
            payer_user_id=payer_user_id,
            customer_email=customer_email,
        )

    async def create_admin_payment_link(
        self, tenant: TenantContext, body: AdminPaymentLinkRequest
    ) -> CheckoutResponse:
        product = await self.repo.get_product(body.product_id, tenant.tenant_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        payer_user_id, customer_email = await self._resolve_payer_email_for_member_checkout(
            student_id=body.student_id,
            tenant_id=tenant.tenant_id,
            payer_user_id=body.payer_user_id,
        )
        return await self._create_stripe_checkout_for_member(
            tenant,
            student_id=body.student_id,
            product=product,
            payer_user_id=payer_user_id,
            customer_email=customer_email,
        )

    async def analytics(
        self, tenant: TenantContext, days: int = 30
    ) -> AnalyticsSummary:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        t = await self.repo.get_tenant(tenant.tenant_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        active = await self.repo.count_active_subscriptions(tenant.tenant_id)
        new_c = await self.repo.new_subscriptions_between(tenant.tenant_id, start, end)
        canceled = await self.repo.canceled_between(tenant.tenant_id, start, end)
        rev, inv_n = await self.repo.revenue_paid_between(tenant.tenant_id, start, end)
        churn = None
        if active + canceled > 0:
            churn = round(100.0 * canceled / max(1, active + canceled), 2)
        mrr = await self.repo.mrr_approx_cents(tenant.tenant_id)
        return AnalyticsSummary(
            period_start=start.date().isoformat(),
            period_end=end.date().isoformat(),
            active_subscriptions=active,
            new_subscriptions=new_c,
            canceled_subscriptions=canceled,
            churn_rate_percent=churn,
            revenue_cents=rev,
            paid_invoices_count=inv_n,
            mrr_cents_approx=mrr,
        )
