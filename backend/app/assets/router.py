"""Assets router."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, status
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context

logger = logging.getLogger(__name__)

from .schemas import AssetLibraryResponse, AssetListResponse, AssetResponse, AssetUpdate
from .service import AssetsService

router = APIRouter(tags=["Assets"])


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""
    from app.dependencies import get_tenant_context

    return Depends(get_tenant_context)


@router.post(
    "/",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("assets", "create")],
)
async def upload_asset(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    file: UploadFile = File(...),
    name: str = Form(...),
    asset_type: str = Form(...),
    lab_type: str | None = Form(None),
    owner_type: str | None = Form(None, description="Set to 'tenant' to create a shared tenant asset"),
):
    """Upload asset (multipart to R2)."""
    logger.info(
        "Asset upload user=%s tenant=%s type=%s owner_type=%s",
        identity.id, tenant.tenant_id, asset_type, owner_type or "self",
    )
    service = AssetsService(db)
    return await service.upload_asset(
        identity=identity,
        tenant_ctx=tenant,
        file=file,
        name=name,
        asset_type=asset_type,
        lab_type=lab_type,
        owner_type_override=owner_type,
    )


@router.get(
    "/",
    response_model=AssetListResponse,
    dependencies=[_require_tenant(), require_permission("assets", "view")],
)
async def list_assets(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    asset_type: str | None = Query(None),
    lab_type: str | None = Query(None),
    owner_id: UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """List assets (filterable by asset_type, lab_type, owner)."""
    service = AssetsService(db)
    return await service.list_assets(
        identity=identity,
        tenant_ctx=tenant,
        asset_type=asset_type,
        lab_type=lab_type,
        owner_id=owner_id,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/library",
    response_model=AssetLibraryResponse,
    dependencies=[_require_tenant(), require_permission("assets", "view")],
)
async def get_library(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    asset_type: str | None = Query(None),
    lab_type: str | None = Query(None),
):
    """Combined view of own + shared + global assets."""
    service = AssetsService(db)
    return await service.get_library(
        identity=identity,
        tenant_ctx=tenant,
        asset_type=asset_type,
        lab_type=lab_type,
    )


@router.get(
    "/{id}",
    response_model=AssetResponse,
    dependencies=[_require_tenant(), require_permission("assets", "view")],
)
async def get_asset(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    expires_in: int = Query(3600, ge=60, le=86400),
):
    """Get asset with signed download URL."""
    service = AssetsService(db)
    return await service.get_asset(
        asset_id=id,
        identity=identity,
        tenant_ctx=tenant,
        expires_in=expires_in,
    )


@router.patch(
    "/{id}",
    response_model=AssetResponse,
    dependencies=[_require_tenant(), require_permission("assets", "create")],
)
async def update_asset(
    id: UUID,
    data: AssetUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Rename/update asset metadata."""
    logger.info("Asset update asset=%s user=%s tenant=%s", id, identity.id, tenant.tenant_id)
    service = AssetsService(db)
    return await service.update_asset(
        asset_id=id,
        identity=identity,
        tenant_ctx=tenant,
        data=data,
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("assets", "create")],
)
async def delete_asset(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete asset."""
    logger.info("Asset delete asset=%s user=%s tenant=%s", id, identity.id, tenant.tenant_id)
    service = AssetsService(db)
    await service.delete_asset(
        asset_id=id,
        identity=identity,
        tenant_ctx=tenant,
    )
