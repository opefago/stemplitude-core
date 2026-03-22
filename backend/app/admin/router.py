"""Admin router."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, status, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_super_admin
from app.database import get_db
from app.dependencies import require_identity

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
    ZeroEnrollmentResponse,
)
from .service import AdminService

router = APIRouter()

PERIOD_SHORTCUTS = {
    "last_7d": timedelta(days=7),
    "last_30d": timedelta(days=30),
    "last_6m": timedelta(days=182),
    "last_1y": timedelta(days=365),
}


def _resolve_period(
    since: datetime | None, until: datetime | None, period: str | None
) -> tuple[datetime | None, datetime | None]:
    """Apply period shortcut and default `until` to now when `since` is set."""
    now = datetime.now(timezone.utc)
    if period and period in PERIOD_SHORTCUTS:
        since = now - PERIOD_SHORTCUTS[period]
    if since and not until:
        until = now
    return since, until


@router.post("/global-assets", response_model=GlobalAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_global_asset(
    request: Request,
    file: UploadFile = File(...),
    asset_type: str = Form(..., description="Asset type, e.g. sprite, sound, background, 3d_model."),
    name: str = Form(..., description="Display name for the asset."),
    uploaded_by_org_id: UUID | None = Form(None, description="Tenant/org ID to attribute the upload to an organization. Omit to attribute to the current user."),
    lab_type: str | None = Form(None, description="Lab this asset belongs to, e.g. electronics, design_maker."),
    category: str | None = Form(None, description="Optional sub-category within the asset type."),
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Upload a global asset (super admin only).

    To upload on behalf of an organization, pass uploaded_by_org_id.
    Otherwise, the asset is attributed to the authenticated user.
    """
    identity = require_identity(request)
    service = AdminService(db)
    return await service.create_global_asset(
        file=file,
        identity=identity,
        asset_type=asset_type,
        name=name,
        uploaded_by_org_id=uploaded_by_org_id,
        lab_type=lab_type,
        category=category,
    )


@router.get("/global-assets", response_model=GlobalAssetListResponse)
async def list_global_assets(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    asset_type: str | None = Query(None),
    lab_type: str | None = Query(None),
    category: str | None = Query(None),
    is_active: bool | None = Query(None),
    _: None = require_super_admin(),
):
    """List global assets (super admin only)."""
    service = AdminService(db)
    return await service.list_global_assets(
        skip=skip,
        limit=limit,
        asset_type=asset_type,
        lab_type=lab_type,
        category=category,
        is_active=is_active,
    )


@router.patch("/global-assets/{id}", response_model=GlobalAssetResponse)
async def update_global_asset(
    id: UUID,
    data: GlobalAssetUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Update global asset (super admin only)."""
    service = AdminService(db)
    asset = await service.update_global_asset(id, data)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset


@router.delete("/global-assets/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_asset(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Delete global asset (super admin only)."""
    service = AdminService(db)
    deleted = await service.delete_global_asset(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip."),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of records to return."),
    is_active: bool | None = Query(None, description="Filter by active status."),
    _: None = require_super_admin(),
):
    """List tenants with pagination (super admin only)."""
    service = AdminService(db)
    return await service.list_tenants(skip=skip, limit=limit, is_active=is_active)


@router.get("/stats", response_model=AdminStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(None, description="Start date (ISO 8601)."),
    until: datetime | None = Query(None, description="End date (defaults to now)."),
    period: str | None = Query(None, description="Shortcut: 'last_7d', 'last_30d', 'last_6m', 'last_1y'. Overrides 'since' if both provided."),
    _: None = require_super_admin(),
):
    """Get admin dashboard overview stats (super admin only)."""
    since, until = _resolve_period(since, until, period)
    service = AdminService(db)
    return await service.get_stats(since=since, until=until)


@router.get("/metrics/growth", response_model=GrowthMetrics)
async def get_growth_metrics(
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(None, description="Start of the period (defaults to 6 months ago)."),
    until: datetime | None = Query(None, description="End of the period (defaults to now)."),
    granularity: str = Query("month", description="Aggregation period: 'month' or 'week'."),
    _: None = require_super_admin(),
):
    """Tenant, user, and enrollment growth over time (super admin only)."""
    since, until = _resolve_period(since, until, period=None)
    now = datetime.now(timezone.utc)
    service = AdminService(db)
    return await service.get_growth_metrics(
        since=since or (now - timedelta(days=180)),
        until=until or now,
        granularity=granularity,
    )


@router.get("/metrics/counts", response_model=MetricCounts)
async def get_metric_counts(
    db: AsyncSession = Depends(get_db),
    inactive_days: int = Query(30, ge=1, description="Inactivity threshold in days for the inactive-tenant count."),
    _: None = require_super_admin(),
):
    """Lightweight counts for dashboard summary cards (super admin only).

    Returns inactive tenant count, zero-enrollment count, and churned tenant count
    in a single request -- no pagination overhead.
    """
    service = AdminService(db)
    return await service.get_metric_counts(inactive_days=inactive_days)


@router.get("/metrics/inactive-tenants", response_model=InactiveTenantsResponse)
async def get_inactive_tenants(
    db: AsyncSession = Depends(get_db),
    inactive_days: int = Query(30, ge=1, description="Minimum number of days of inactivity."),
    sort_order: str = Query("asc", description="Sort by inactivity: 'asc' (most inactive first) or 'desc' (least inactive first)."),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_super_admin(),
):
    """Tenants with no enrollment or subscription activity within N days (super admin only)."""
    service = AdminService(db)
    return await service.get_inactive_tenants(
        inactive_days=inactive_days, sort_order=sort_order, skip=skip, limit=limit
    )


@router.get("/metrics/zero-enrollment", response_model=ZeroEnrollmentResponse)
async def get_zero_enrollment_tenants(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_super_admin(),
):
    """Tenants that registered but have no student enrollments (super admin only)."""
    service = AdminService(db)
    return await service.get_zero_enrollment_tenants(skip=skip, limit=limit)


@router.get("/metrics/churn", response_model=ChurnedTenantsResponse)
async def get_churned_tenants(
    db: AsyncSession = Depends(get_db),
    churn_type: str | None = Query(None, description="Filter: 'trial' for trial churn, 'paid' for post-paid churn, omit for both."),
    sort_order: str = Query("desc", description="Sort by churn date: 'desc' (most recent first) or 'asc' (oldest first)."),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_super_admin(),
):
    """Tenants that did not renew after trial or paid subscription ended (super admin only)."""
    service = AdminService(db)
    return await service.get_churned_tenants(
        churn_type=churn_type, sort_order=sort_order, skip=skip, limit=limit
    )


@router.get("/metrics/subscriptions", response_model=list[SubscriptionBreakdown])
async def get_subscription_breakdown(
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(None, description="Start date. Accepts ISO 8601 or shortcuts: 'last_7d', 'last_30d', 'last_6m', 'last_1y'."),
    until: datetime | None = Query(None, description="End date (defaults to now)."),
    period: str | None = Query(None, description="Shortcut: 'last_7d', 'last_30d', 'last_6m', 'last_1y'. Overrides 'since' if both provided."),
    _: None = require_super_admin(),
):
    """Subscription counts grouped by status (super admin only)."""
    since, until = _resolve_period(since, until, period)
    service = AdminService(db)
    return await service.get_subscription_breakdown(since=since, until=until)
