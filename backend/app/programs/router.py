"""Program router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.programs.schemas import (
    ProgramBulkLinkCurriculaRequest,
    ProgramBulkLinkCurriculaResponse,
    ProgramCreate,
    ProgramResponse,
    ProgramUpdate,
)
from app.programs.service import ProgramService

router = APIRouter()


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""

    async def _get(request: Request) -> TenantContext:
        return get_tenant_context(request)

    return Depends(_get)


@router.post(
    "/",
    response_model=ProgramResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("programs", "create")],
)
async def create_program(
    data: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a program."""
    service = ProgramService(db)
    return await service.create(data, tenant.tenant_id)


@router.get(
    "/",
    response_model=list[ProgramResponse],
    dependencies=[_require_tenant(), require_permission("programs", "view")],
)
async def list_programs(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    is_active: bool | None = Query(None),
):
    """List programs."""
    service = ProgramService(db)
    return await service.list(
        tenant.tenant_id, skip=skip, limit=limit, is_active=is_active
    )


@router.get(
    "/{id}",
    response_model=ProgramResponse,
    dependencies=[_require_tenant(), require_permission("programs", "view")],
)
async def get_program(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get program by ID."""
    service = ProgramService(db)
    return await service.get_by_id(id, tenant.tenant_id)


@router.patch(
    "/{id}",
    response_model=ProgramResponse,
    dependencies=[_require_tenant(), require_permission("programs", "update")],
)
async def update_program(
    id: UUID,
    data: ProgramUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a program."""
    service = ProgramService(db)
    return await service.update(id, data, tenant.tenant_id)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("programs", "delete")],
)
async def delete_program(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a program."""
    service = ProgramService(db)
    await service.delete(id, tenant.tenant_id)


@router.post(
    "/{id}/bulk-link-curricula",
    response_model=ProgramBulkLinkCurriculaResponse,
    dependencies=[_require_tenant(), require_permission("programs", "update")],
)
async def bulk_link_curricula(
    id: UUID,
    data: ProgramBulkLinkCurriculaRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Bulk attach curricula to program."""
    service = ProgramService(db)
    return await service.bulk_attach_curricula(
        program_id=id,
        tenant_id=tenant.tenant_id,
        curriculum_ids=data.curriculum_ids,
    )
