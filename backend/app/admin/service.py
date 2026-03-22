"""Admin service."""

import logging
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage
from app.core.pipeline import Pipeline
from app.dependencies import CurrentIdentity

from .repository import AdminRepository
from datetime import datetime

from .schemas import (
    AdminStats,
    ChurnedTenantsResponse,
    GlobalAssetListResponse,
    GlobalAssetResponse,
    GlobalAssetUpdate,
    GrowthMetrics,
    InactiveTenantsResponse,
    MetricCounts,
    SubscriptionBreakdown,
    TenantListResponse,
    TenantSummary,
    TimeSeriesPoint,
    ZeroEnrollmentResponse,
)

logger = logging.getLogger(__name__)


class AdminService:
    """Admin business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = AdminRepository(session)

    async def create_global_asset(
        self,
        file: UploadFile,
        identity: CurrentIdentity,
        *,
        asset_type: str,
        name: str,
        uploaded_by_org_id: UUID | None = None,
        lab_type: str | None = None,
        category: str | None = None,
        metadata_: dict | None = None,
    ) -> GlobalAssetResponse:
        """Upload and create a global asset."""
        file_data = await file.read()
        content_type = file.content_type or "application/octet-stream"
        filename = file.filename or "asset"
        asset = await self.repo.create_global_asset(
            uploaded_by_user_id=identity.id if not uploaded_by_org_id else None,
            uploaded_by_org_id=uploaded_by_org_id,
            asset_type=asset_type,
            name=name,
            blob_key="pending",  # Set after upload
            mime_type=content_type,
            file_size=len(file_data),
            metadata_=metadata_,
            lab_type=lab_type,
            category=category,
        )
        blob_key = blob_storage.global_asset_key(asset.id, filename)
        blob_storage.upload_file(blob_key, file_data, content_type)
        blob_url = blob_storage.generate_presigned_url(blob_key)
        asset.blob_key = blob_key
        asset.blob_url = blob_url
        await self.session.flush()
        await self.session.refresh(asset)

        Pipeline.dispatch("thumbnail.generate", {"asset_table": "global_assets", "asset_id": str(asset.id)})

        logger.info(
            "Global asset created id=%s uploaded_by_user=%s uploaded_by_org=%s",
            asset.id,
            asset.uploaded_by_user_id,
            asset.uploaded_by_org_id,
        )
        return GlobalAssetResponse.model_validate(asset)

    async def list_global_assets(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        asset_type: str | None = None,
        lab_type: str | None = None,
        category: str | None = None,
        is_active: bool | None = None,
    ) -> GlobalAssetListResponse:
        """List global assets."""
        assets, total = await self.repo.list_global_assets(
            skip=skip,
            limit=limit,
            asset_type=asset_type,
            lab_type=lab_type,
            category=category,
            is_active=is_active,
        )
        return GlobalAssetListResponse(
            items=[GlobalAssetResponse.model_validate(a) for a in assets],
            total=total,
        )

    async def get_global_asset(self, asset_id: UUID) -> GlobalAssetResponse | None:
        """Get global asset by ID."""
        asset = await self.repo.get_global_asset_by_id(asset_id)
        return GlobalAssetResponse.model_validate(asset) if asset else None

    async def update_global_asset(
        self,
        asset_id: UUID,
        data: GlobalAssetUpdate,
    ) -> GlobalAssetResponse | None:
        """Update global asset."""
        asset = await self.repo.get_global_asset_by_id(asset_id)
        if not asset:
            return None
        update_data = data.model_dump(exclude_unset=True, by_alias=True)
        if "metadata" in update_data:
            update_data["metadata_"] = update_data.pop("metadata")
        await self.repo.update_global_asset(asset, **update_data)
        logger.info("Global asset updated id=%s fields=%s", asset_id, list(update_data.keys()))
        return GlobalAssetResponse.model_validate(asset)

    async def delete_global_asset(self, asset_id: UUID) -> bool:
        """Delete global asset and its blob."""
        asset = await self.repo.get_global_asset_by_id(asset_id)
        if not asset:
            return False
        blob_storage.delete_file(asset.blob_key)
        await self.repo.delete_global_asset(asset)
        logger.info("Global asset deleted id=%s blob_key=%s", asset_id, asset.blob_key)
        return True

    async def list_tenants(
        self, *, skip: int = 0, limit: int = 50, is_active: bool | None = None
    ) -> TenantListResponse:
        """List tenants with pagination."""
        logger.info("Tenant list queried skip=%d limit=%d", skip, limit)
        tenants, total = await self.repo.list_tenants(
            skip=skip, limit=limit, is_active=is_active
        )
        return TenantListResponse(
            items=[TenantSummary.model_validate(t) for t in tenants],
            total=total,
        )

    async def get_stats(
        self, *, since: datetime | None = None, until: datetime | None = None
    ) -> AdminStats:
        """Get admin dashboard stats."""
        stats = await self.repo.get_stats(since=since, until=until)
        return AdminStats(**stats)

    async def get_metric_counts(self, *, inactive_days: int = 30) -> MetricCounts:
        """Lightweight counts for dashboard summary cards."""
        logger.debug("Metrics summary counts inactive_days=%d", inactive_days)
        data = await self.repo.get_metric_counts(inactive_days=inactive_days)
        return MetricCounts(**data)

    async def get_growth_metrics(
        self, *, since: datetime, until: datetime, granularity: str = "month"
    ) -> GrowthMetrics:
        logger.debug("Metrics query growth since=%s until=%s granularity=%s", since, until, granularity)
        data = await self.repo.get_growth_timeseries(
            since=since, until=until, granularity=granularity
        )
        return GrowthMetrics(
            tenants_created=[TimeSeriesPoint(**p) for p in data["tenants_created"]],
            users_created=[TimeSeriesPoint(**p) for p in data["users_created"]],
            students_enrolled=[TimeSeriesPoint(**p) for p in data["students_enrolled"]],
        )

    async def get_inactive_tenants(
        self, *, inactive_days: int = 30, sort_order: str = "asc", skip: int = 0, limit: int = 50
    ) -> InactiveTenantsResponse:
        logger.debug("Metrics query inactive tenants inactive_days=%d sort=%s skip=%d limit=%d", inactive_days, sort_order, skip, limit)
        items, total = await self.repo.get_inactive_tenants(
            inactive_days=inactive_days, sort_order=sort_order, skip=skip, limit=limit
        )
        return InactiveTenantsResponse(items=items, total=total)

    async def get_zero_enrollment_tenants(
        self, *, skip: int = 0, limit: int = 50
    ) -> ZeroEnrollmentResponse:
        logger.debug("Metrics query zero enrollment skip=%d limit=%d", skip, limit)
        items, total = await self.repo.get_zero_enrollment_tenants(skip=skip, limit=limit)
        return ZeroEnrollmentResponse(items=items, total=total)

    async def get_churned_tenants(
        self, *, churn_type: str | None = None, sort_order: str = "desc", skip: int = 0, limit: int = 50
    ) -> ChurnedTenantsResponse:
        logger.debug("Metrics query churned tenants churn_type=%s sort=%s skip=%d limit=%d", churn_type, sort_order, skip, limit)
        items, total = await self.repo.get_churned_tenants(
            churn_type=churn_type, sort_order=sort_order, skip=skip, limit=limit
        )
        return ChurnedTenantsResponse(items=items, total=total)

    async def get_subscription_breakdown(
        self, *, since: datetime | None = None, until: datetime | None = None
    ) -> list[SubscriptionBreakdown]:
        logger.debug("Metrics query subscription breakdown since=%s until=%s", since, until)
        data = await self.repo.get_subscription_breakdown(since=since, until=until)
        return [SubscriptionBreakdown(**d) for d in data]
