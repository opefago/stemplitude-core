"""License router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_super_admin
from app.database import get_db
from app.dependencies import get_current_identity, get_tenant_context, CurrentIdentity, TenantContext

from .schemas import EntitlementsResponse, LicenseCreate, LicenseResponse, LicenseUpdate, SeatUsageResponse
from .service import LicenseService

router = APIRouter()


@router.get("/", response_model=LicenseResponse | None)
async def get_current_license(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Get current license for the tenant."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = LicenseService(db)
    return await service.get_current_license(identity, tenant_ctx)


@router.get("/entitlements", response_model=EntitlementsResponse)
async def get_entitlements(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Get features and limits for current license."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = LicenseService(db)
    return await service.get_entitlements(identity, tenant_ctx)


@router.get("/seats", response_model=list[SeatUsageResponse])
async def get_seats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Get seat usage for current license."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = LicenseService(db)
    return await service.get_seats(identity, tenant_ctx)


@router.post("/", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
async def create_license(
    data: LicenseCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    _: None = require_super_admin(),
):
    """Create a license (super admin)."""
    service = LicenseService(db)
    return await service.create(data, identity)


@router.patch("/{id}", response_model=LicenseResponse)
async def update_license(
    id: UUID,
    data: LicenseUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    _: None = require_super_admin(),
):
    """Update a license (super admin)."""
    service = LicenseService(db)
    license_ = await service.update(id, data, identity)
    if not license_:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found")
    return license_
