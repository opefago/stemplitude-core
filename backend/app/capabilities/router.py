"""Capability router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission, require_super_admin
from app.database import get_db
from app.dependencies import CurrentIdentity, get_current_identity

from .schemas import (
    CapabilityCheckRequest,
    CapabilityCheckResponse,
    CapabilityCreate,
    CapabilityResponse,
    CapabilityUpdate,
    LabLauncherResponse,
)
from .service import CapabilityService

router = APIRouter()


@router.post("/check", response_model=CapabilityCheckResponse)
async def check_capability(
    data: CapabilityCheckRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Check if the current identity has a capability in tenant context."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = CapabilityService(db)
    return await service.check(identity, tenant_ctx, data.capability_key)


@router.get("/lab-launcher", response_model=LabLauncherResponse)
async def lab_launcher_availability(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Which labs are available in this workspace (license + tenant lab toggles)."""
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = CapabilityService(db)
    return await service.lab_launcher_availability(identity, tenant_ctx)


@router.get("/", response_model=list[CapabilityResponse])
async def list_capabilities(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    _: None = require_permission("capabilities", "view"),
):
    """List all capabilities (admin)."""
    service = CapabilityService(db)
    items, _ = await service.list_all(skip=skip, limit=limit)
    return items


@router.post("/", response_model=CapabilityResponse, status_code=status.HTTP_201_CREATED)
async def create_capability(
    data: CapabilityCreate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Create a capability (super admin)."""
    service = CapabilityService(db)
    return await service.create(data)


@router.patch("/{id}", response_model=CapabilityResponse)
async def update_capability(
    id: UUID,
    data: CapabilityUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Update a capability (super admin)."""
    service = CapabilityService(db)
    cap = await service.update(id, data)
    if not cap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capability not found")
    return cap
