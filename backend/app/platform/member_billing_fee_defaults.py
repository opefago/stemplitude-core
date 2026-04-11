"""Singleton DB row for platform-wide member billing (Stripe Connect) application fee."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.models import PLATFORM_STRIPE_BILLING_SETTINGS_ID, PlatformStripeBillingSettings


async def get_default_member_billing_application_fee_bps(session: AsyncSession) -> int:
    result = await session.execute(
        select(PlatformStripeBillingSettings).where(
            PlatformStripeBillingSettings.id == PLATFORM_STRIPE_BILLING_SETTINGS_ID
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return 0
    return max(0, min(10_000, int(row.member_billing_default_application_fee_bps or 0)))


async def set_default_member_billing_application_fee_bps(
    session: AsyncSession, bps: int
) -> int:
    bps = max(0, min(10_000, int(bps)))
    result = await session.execute(
        select(PlatformStripeBillingSettings).where(
            PlatformStripeBillingSettings.id == PLATFORM_STRIPE_BILLING_SETTINGS_ID
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = PlatformStripeBillingSettings(
            id=PLATFORM_STRIPE_BILLING_SETTINGS_ID,
            member_billing_default_application_fee_bps=bps,
        )
        session.add(row)
    else:
        row.member_billing_default_application_fee_bps = bps
    await session.flush()
    return bps
