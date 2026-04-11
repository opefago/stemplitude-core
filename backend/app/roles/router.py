from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.roles.schemas import (
    AssignPermissionsRequest,
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
    RoleWithPermissionsResponse,
)
from app.roles.service import RoleService
from app.schemas.pagination import Paginated

router = APIRouter()


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""

    async def _get(request: Request) -> TenantContext:
        return get_tenant_context(request)

    return Depends(_get)


# Admin-only: roles module requires roles:view for list, roles:create for create, etc.
_admin_deps = [_require_tenant(), require_permission("roles", "view")]


@router.get(
    "/",
    response_model=Paginated[RoleResponse],
    dependencies=_admin_deps,
)
async def list_roles(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    service = RoleService(db)
    return await service.list_roles_paginated(
        tenant.tenant_id, skip=skip, limit=limit
    )


@router.get(
    "/permissions",
    response_model=Paginated[PermissionResponse],
    dependencies=_admin_deps,
)
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
):
    service = RoleService(db)
    return await service.list_permissions_paginated(skip=skip, limit=limit)


@router.post(
    "/",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("roles", "create")],
)
async def create_role(
    data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    role = await service.create_role(tenant.tenant_id, data)
    return RoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        slug=role.slug,
        is_system=role.is_system,
        is_active=role.is_active,
    )


@router.get(
    "/{id}",
    response_model=RoleWithPermissionsResponse,
    dependencies=_admin_deps,
)
async def get_role(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    role = await service.get_role_with_permissions(id, tenant.tenant_id)
    permissions = await service.repo.get_role_permissions(id)
    return RoleWithPermissionsResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        slug=role.slug,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[
            PermissionResponse(
                id=p.id,
                resource=p.resource,
                action=p.action,
                description=p.description,
            )
            for p in permissions
        ],
    )


@router.patch(
    "/{id}",
    response_model=RoleResponse,
    dependencies=[_require_tenant(), require_permission("roles", "update")],
)
async def update_role(
    id: UUID,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    role = await service.update_role(id, tenant.tenant_id, data)
    return RoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        slug=role.slug,
        is_system=role.is_system,
        is_active=role.is_active,
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("roles", "delete")],
)
async def delete_role(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    await service.delete_role(id, tenant.tenant_id)


@router.post(
    "/{id}/permissions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("roles", "manage_permissions")],
)
async def assign_permissions(
    id: UUID,
    data: AssignPermissionsRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    await service.assign_permissions(id, tenant.tenant_id, data)


@router.delete(
    "/{id}/permissions/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("roles", "manage_permissions")],
)
async def revoke_permission(
    id: UUID,
    permission_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoleService(db)
    await service.revoke_permission(id, permission_id, tenant.tenant_id)
