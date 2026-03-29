from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.member_billing_fee_defaults import get_default_member_billing_application_fee_bps
from app.tenants.models import Tenant


async def resolve_effective_member_billing_application_fee_bps(
    session: AsyncSession, tenant: Tenant
) -> int:
    if tenant.member_billing_application_fee_use_platform_default:
        return await get_default_member_billing_application_fee_bps(session)
    return int(tenant.member_billing_application_fee_bps or 0)
