"""Optional access gate when tenant requires active member billing for student actions."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.tenants.models import Tenant

from .repository import MemberBillingRepository


async def assert_member_billing_access_allowed(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    student_id: uuid.UUID,
) -> None:
    t = await db.get(Tenant, tenant_id)
    if not t or not t.require_member_billing_for_access:
        return
    repo = MemberBillingRepository(db)
    if await repo.student_has_active_entitlement(tenant_id, student_id):
        return
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="An active membership payment is required for this action. Complete billing in Settings → Membership.",
    )
