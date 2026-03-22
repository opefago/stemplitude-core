"""License repository."""

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.licenses.models import License, LicenseFeature, LicenseLimit, SeatUsage


class LicenseRepository:
    """Repository for license queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, license_id: UUID) -> License | None:
        """Get license by ID."""
        result = await self.session.execute(
            select(License)
            .where(License.id == license_id)
            .options(
                selectinload(License.features),
                selectinload(License.limits),
            )
        )
        return result.scalar_one_or_none()

    async def get_active_for_tenant(self, tenant_id: UUID) -> License | None:
        """Get active license for tenant (current license)."""
        today = date.today()
        result = await self.session.execute(
            select(License)
            .where(
                License.tenant_id == tenant_id,
                License.status == "active",
                License.valid_from <= today,
                (License.valid_until.is_(None)) | (License.valid_until >= today),
            )
            .options(
                selectinload(License.features),
                selectinload(License.limits),
            )
            .order_by(License.valid_until.desc().nullslast())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_seats_for_license(self, license_id: UUID) -> list[SeatUsage]:
        """List seat usage for a license."""
        result = await self.session.execute(
            select(SeatUsage).where(SeatUsage.license_id == license_id)
        )
        return list(result.scalars().all())

    async def list_seats_for_tenant(self, tenant_id: UUID) -> list[SeatUsage]:
        """List seat usage for a tenant (from active license)."""
        license_ = await self.get_active_for_tenant(tenant_id)
        if not license_:
            return []
        return await self.list_seats_for_license(license_.id)
