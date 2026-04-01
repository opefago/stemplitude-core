"""FastAPI dependencies for tenant analytics (capability + plan gates)."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.capabilities.service import CapabilityService
from app.database import get_db
from app.dependencies import CurrentIdentity, get_current_identity


async def require_tenant_analytics_view(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
) -> None:
    if getattr(identity, "is_super_admin", False):
        return
    if identity.sub_type == "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students cannot view organization analytics",
        )
    tenant_ctx = getattr(request.state, "tenant", None)
    if tenant_ctx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-ID header required",
        )
    svc = CapabilityService(db)
    result = await svc.check(identity, tenant_ctx, "view_analytics")
    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=result.reason or "Analytics not available for this plan or role",
        )


async def require_tenant_analytics_export(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
) -> None:
    await require_tenant_analytics_view(request, db, identity)
    if getattr(identity, "is_super_admin", False):
        return
    tenant_ctx = getattr(request.state, "tenant", None)
    if tenant_ctx is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant required")
    perms = getattr(tenant_ctx, "permissions", set()) or set()
    if "analytics:export" not in perms and "analytics:*" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: analytics:export",
        )
    from app.capabilities.repository import CapabilityEngineRepository

    repo = CapabilityEngineRepository(db)
    license_ = await repo.get_active_license(tenant_ctx.tenant_id)
    if not license_:
        link = await repo.get_hierarchy_link(tenant_ctx.tenant_id)
        if link and getattr(link, "billing_mode", None) != "independent":
            license_ = await repo.get_active_license(link.parent_tenant_id)
    if not license_ or not await repo.has_license_feature(license_.id, "analytics_export"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSV export requires an Enterprise plan",
        )
