"""License service."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.dependencies import CurrentIdentity, TenantContext
from app.licenses.models import License, LicenseFeature, LicenseLimit, SeatUsage

from .repository import LicenseRepository
from .schemas import (
    EntitlementsResponse,
    LicenseCreate,
    LicenseFeatureResponse,
    LicenseLimitResponse,
    LicenseResponse,
    LicenseUpdate,
    SeatUsageResponse,
)


class LicenseService:
    """License business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = LicenseRepository(session)

    async def get_current_license(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> LicenseResponse | None:
        """Get current (active) license for the tenant."""
        license_ = await self.repo.get_active_for_tenant(tenant_ctx.tenant_id)
        return self._to_response(license_) if license_ else None

    async def get_entitlements(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> EntitlementsResponse:
        """Get features and limits for current license."""
        license_ = await self.repo.get_active_for_tenant(tenant_ctx.tenant_id)
        if not license_:
            return EntitlementsResponse(features=[], limits=[])

        return EntitlementsResponse(
            features=[LicenseFeatureResponse.model_validate(f) for f in license_.features],
            limits=[LicenseLimitResponse.model_validate(l) for l in license_.limits],
        )

    async def get_seats(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> list[SeatUsageResponse]:
        """Get seat usage for current license."""
        seats = await self.repo.list_seats_for_tenant(tenant_ctx.tenant_id)
        return [SeatUsageResponse.model_validate(s) for s in seats]

    async def get_by_id(
        self,
        license_id: UUID,
        identity: CurrentIdentity,
    ) -> LicenseResponse | None:
        """Get license by ID (super admin)."""
        license_ = await self.repo.get_by_id(license_id)
        return self._to_response(license_) if license_ else None

    async def create(
        self,
        data: LicenseCreate,
        identity: CurrentIdentity,
    ) -> LicenseResponse:
        """Create a license (super admin)."""
        license_ = License(
            subscription_id=data.subscription_id,
            tenant_id=data.tenant_id,
            user_id=data.user_id,
            status=data.status,
            valid_from=data.valid_from,
            valid_until=data.valid_until,
        )
        self.session.add(license_)
        await self.session.flush()

        for f in data.features:
            feat = LicenseFeature(
                license_id=license_.id,
                feature_key=f.feature_key,
                enabled=f.enabled,
            )
            self.session.add(feat)

        for lim in data.limits:
            limit = LicenseLimit(
                license_id=license_.id,
                limit_key=lim.limit_key,
                limit_value=lim.limit_value,
            )
            self.session.add(limit)

        for seat_def in data.seats:
            seat = SeatUsage(
                license_id=license_.id,
                tenant_id=data.tenant_id,
                seat_type=seat_def.seat_type,
                max_count=seat_def.max_count,
            )
            self.session.add(seat)

        await self.session.refresh(license_)
        logger.info("License created id=%s tenant=%s", license_.id, license_.tenant_id)
        return self._to_response(license_)

    async def update(
        self,
        license_id: UUID,
        data: LicenseUpdate,
        identity: CurrentIdentity,
    ) -> LicenseResponse | None:
        """Update a license (super admin)."""
        license_ = await self.repo.get_by_id(license_id)
        if not license_:
            logger.warning("License not found id=%s", license_id)
            return None

        update_fields = {"subscription_id", "user_id", "status", "valid_from", "valid_until"}
        for field in update_fields:
            val = getattr(data, field, None)
            if val is not None:
                setattr(license_, field, val)

        if data.features is not None:
            for f in license_.features:
                self.session.delete(f)
            for f in data.features:
                feat = LicenseFeature(
                    license_id=license_.id,
                    feature_key=f.feature_key,
                    enabled=f.enabled,
                )
                self.session.add(feat)

        if data.limits is not None:
            for lim in license_.limits:
                self.session.delete(lim)
            for lim in data.limits:
                limit = LicenseLimit(
                    license_id=license_.id,
                    limit_key=lim.limit_key,
                    limit_value=lim.limit_value,
                )
                self.session.add(limit)

        await self.session.refresh(license_)
        logger.info("License updated id=%s", license_id)
        return self._to_response(license_)

    def _to_response(self, license_: License) -> LicenseResponse:
        """Convert License model to LicenseResponse."""
        return LicenseResponse(
            id=license_.id,
            subscription_id=license_.subscription_id,
            tenant_id=license_.tenant_id,
            user_id=license_.user_id,
            status=license_.status,
            valid_from=license_.valid_from,
            valid_until=license_.valid_until,
            created_at=license_.created_at,
            features=[LicenseFeatureResponse.model_validate(f) for f in license_.features],
            limits=[LicenseLimitResponse.model_validate(l) for l in license_.limits],
        )
