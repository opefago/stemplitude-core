from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tenants.models import Tenant

from .models import MemberBillingProduct, MemberInvoice, MemberPurchase, MemberSubscription


class MemberBillingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_tenant(self, tenant_id: uuid.UUID) -> Tenant | None:
        return await self.db.get(Tenant, tenant_id)

    async def get_product(self, product_id: uuid.UUID, tenant_id: uuid.UUID) -> MemberBillingProduct | None:
        r = await self.db.execute(
            select(MemberBillingProduct).where(
                MemberBillingProduct.id == product_id,
                MemberBillingProduct.tenant_id == tenant_id,
            )
        )
        return r.scalar_one_or_none()

    async def list_products(self, tenant_id: uuid.UUID, active_only: bool = False) -> list[MemberBillingProduct]:
        q = select(MemberBillingProduct).where(MemberBillingProduct.tenant_id == tenant_id)
        if active_only:
            q = q.where(MemberBillingProduct.active.is_(True))
        q = q.order_by(MemberBillingProduct.created_at.desc())
        return list((await self.db.execute(q)).scalars().all())

    async def create_product(self, p: MemberBillingProduct) -> MemberBillingProduct:
        self.db.add(p)
        await self.db.flush()
        return p

    async def get_subscription_by_stripe_id(
        self, stripe_subscription_id: str
    ) -> MemberSubscription | None:
        r = await self.db.execute(
            select(MemberSubscription).where(MemberSubscription.stripe_subscription_id == stripe_subscription_id)
        )
        return r.scalar_one_or_none()

    async def get_invoice_by_stripe_id(self, stripe_invoice_id: str) -> MemberInvoice | None:
        r = await self.db.execute(
            select(MemberInvoice).where(MemberInvoice.stripe_invoice_id == stripe_invoice_id)
        )
        return r.scalar_one_or_none()

    async def list_subscriptions(
        self, tenant_id: uuid.UUID, limit: int = 200
    ) -> list[MemberSubscription]:
        r = await self.db.execute(
            select(MemberSubscription)
            .where(MemberSubscription.tenant_id == tenant_id)
            .order_by(MemberSubscription.created_at.desc())
            .limit(limit)
        )
        return list(r.scalars().all())

    async def list_invoices(self, tenant_id: uuid.UUID, limit: int = 200) -> list[MemberInvoice]:
        r = await self.db.execute(
            select(MemberInvoice)
            .where(MemberInvoice.tenant_id == tenant_id)
            .order_by(MemberInvoice.created_at.desc())
            .limit(limit)
        )
        return list(r.scalars().all())

    async def list_invoices_for_payer(
        self, tenant_id: uuid.UUID, payer_user_id: uuid.UUID, limit: int = 100
    ) -> list[MemberInvoice]:
        subq = (
            select(MemberSubscription.id)
            .where(
                MemberSubscription.tenant_id == tenant_id,
                MemberSubscription.payer_user_id == payer_user_id,
            )
            .scalar_subquery()
        )
        r = await self.db.execute(
            select(MemberInvoice)
            .where(
                MemberInvoice.tenant_id == tenant_id,
                MemberInvoice.member_subscription_id.in_(subq),
            )
            .order_by(MemberInvoice.created_at.desc())
            .limit(limit)
        )
        return list(r.scalars().all())

    async def list_purchases_for_student(
        self, tenant_id: uuid.UUID, student_id: uuid.UUID
    ) -> list[MemberPurchase]:
        r = await self.db.execute(
            select(MemberPurchase)
            .where(
                MemberPurchase.tenant_id == tenant_id,
                MemberPurchase.student_id == student_id,
            )
            .order_by(MemberPurchase.created_at.desc())
        )
        return list(r.scalars().all())

    async def student_has_active_entitlement(self, tenant_id: uuid.UUID, student_id: uuid.UUID) -> bool:
        active_statuses = ("active", "trialing", "past_due")
        r = await self.db.execute(
            select(func.count(MemberSubscription.id)).where(
                MemberSubscription.tenant_id == tenant_id,
                MemberSubscription.student_id == student_id,
                MemberSubscription.status.in_(active_statuses),
            )
        )
        if int(r.scalar() or 0) > 0:
            return True
        r2 = await self.db.execute(
            select(func.count(MemberPurchase.id)).where(
                MemberPurchase.tenant_id == tenant_id,
                MemberPurchase.student_id == student_id,
                MemberPurchase.paid_at.is_not(None),
            )
        )
        return int(r2.scalar() or 0) > 0

    async def count_active_subscriptions(self, tenant_id: uuid.UUID) -> int:
        r = await self.db.execute(
            select(func.count(MemberSubscription.id)).where(
                MemberSubscription.tenant_id == tenant_id,
                MemberSubscription.status.in_(("active", "trialing")),
            )
        )
        return int(r.scalar() or 0)

    async def subscriptions_renewing_between(
        self, start: datetime, end: datetime
    ) -> list[MemberSubscription]:
        r = await self.db.execute(
            select(MemberSubscription).where(
                MemberSubscription.status.in_(("active", "trialing")),
                MemberSubscription.current_period_end.is_not(None),
                MemberSubscription.current_period_end >= start,
                MemberSubscription.current_period_end <= end,
            )
        )
        return list(r.scalars().all())

    async def new_subscriptions_between(
        self, tenant_id: uuid.UUID, start: datetime, end: datetime
    ) -> int:
        r = await self.db.execute(
            select(func.count(MemberSubscription.id)).where(
                MemberSubscription.tenant_id == tenant_id,
                MemberSubscription.created_at >= start,
                MemberSubscription.created_at < end,
                MemberSubscription.status != "incomplete",
            )
        )
        return int(r.scalar() or 0)

    async def canceled_between(self, tenant_id: uuid.UUID, start: datetime, end: datetime) -> int:
        r = await self.db.execute(
            select(func.count(MemberSubscription.id)).where(
                MemberSubscription.tenant_id == tenant_id,
                MemberSubscription.canceled_at.is_not(None),
                MemberSubscription.canceled_at >= start,
                MemberSubscription.canceled_at < end,
            )
        )
        return int(r.scalar() or 0)

    async def revenue_paid_between(self, tenant_id: uuid.UUID, start: datetime, end: datetime) -> tuple[int, int]:
        r = await self.db.execute(
            select(
                func.coalesce(func.sum(MemberInvoice.amount_cents), 0),
                func.count(MemberInvoice.id),
            ).where(
                MemberInvoice.tenant_id == tenant_id,
                MemberInvoice.status == "paid",
                MemberInvoice.paid_at.is_not(None),
                MemberInvoice.paid_at >= start,
                MemberInvoice.paid_at < end,
            )
        )
        row = r.one()
        return int(row[0] or 0), int(row[1] or 0)

    async def mrr_approx_cents(self, tenant_id: uuid.UUID) -> int:
        """Sum active recurring subs: normalize to monthly cents using product interval."""
        subs = (
            await self.db.execute(
                select(MemberSubscription, MemberBillingProduct)
                .join(MemberBillingProduct, MemberBillingProduct.id == MemberSubscription.product_id)
                .where(
                    MemberSubscription.tenant_id == tenant_id,
                    MemberSubscription.status.in_(("active", "trialing")),
                    MemberBillingProduct.billing_type == "recurring",
                )
            )
        ).all()
        total = 0
        for _sub, prod in subs:
            amt = prod.amount_cents
            if prod.interval == "month":
                total += amt
            elif prod.interval == "quarter":
                total += amt // 3
            elif prod.interval == "year":
                total += amt // 12
            else:
                total += amt
        return total
