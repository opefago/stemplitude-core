import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.roles.models import Permission, Role, RolePermission

logger = logging.getLogger(__name__)
from app.roles.repository import RoleRepository
from app.roles.schemas import (
    AssignPermissionsRequest,
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
)
from app.schemas.pagination import Paginated


class RoleService:
    """Service layer for role operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = RoleRepository(session)

    async def list_roles(
        self, tenant_id: UUID, *, include_inactive: bool = False
    ) -> list[Role]:
        return await self.repo.list_roles(tenant_id, include_inactive=include_inactive)

    async def get_role_with_permissions(
        self, role_id: UUID, tenant_id: UUID
    ) -> Role:
        role = await self.repo.get_role_by_id(role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found",
            )
        if role.tenant_id and role.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role not found in this tenant",
            )
        return role

    async def create_role(
        self, tenant_id: UUID, data: RoleCreate
    ) -> Role:
        existing = await self.repo.get_role_by_slug(tenant_id, data.slug)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role with slug '{data.slug}' already exists",
            )
        role = Role(
            tenant_id=tenant_id,
            name=data.name,
            slug=data.slug,
            is_system=False,
            is_active=True,
        )
        result = await self.repo.create_role(role)
        logger.info("Role created id=%s tenant=%s", result.id, tenant_id)
        return result

    async def update_role(
        self, role_id: UUID, tenant_id: UUID, data: RoleUpdate
    ) -> Role:
        role = await self.get_role_with_permissions(role_id, tenant_id)
        if role.is_system:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify system roles",
            )
        update_data = data.model_dump(exclude_unset=True)
        if "slug" in update_data:
            existing = await self.repo.get_role_by_slug(tenant_id, update_data["slug"])
            if existing and existing.id != role_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Role with slug '{update_data['slug']}' already exists",
                )
        for key, value in update_data.items():
            setattr(role, key, value)
        await self.session.flush()
        await self.session.refresh(role)
        logger.info("Role updated id=%s", role_id)
        return role

    async def delete_role(self, role_id: UUID, tenant_id: UUID) -> None:
        role = await self.get_role_with_permissions(role_id, tenant_id)
        if role.is_system:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete system roles",
            )
        await self.session.delete(role)
        await self.session.flush()

    async def list_permissions(self) -> list[Permission]:
        return await self.repo.list_permissions()

    async def list_roles_paginated(
        self,
        tenant_id: UUID,
        *,
        include_inactive: bool = False,
        skip: int = 0,
        limit: int = 100,
    ) -> Paginated[RoleResponse]:
        roles, total = await self.repo.list_roles_page(
            tenant_id,
            include_inactive=include_inactive,
            skip=skip,
            limit=limit,
        )
        items = [
            RoleResponse(
                id=r.id,
                tenant_id=r.tenant_id,
                name=r.name,
                slug=r.slug,
                is_system=r.is_system,
                is_active=r.is_active,
            )
            for r in roles
        ]
        return Paginated(items=items, total=total, skip=skip, limit=limit)

    async def list_permissions_paginated(
        self,
        *,
        skip: int = 0,
        limit: int = 200,
    ) -> Paginated[PermissionResponse]:
        perms, total = await self.repo.list_permissions_page(skip=skip, limit=limit)
        items = [
            PermissionResponse(
                id=p.id,
                resource=p.resource,
                action=p.action,
                description=p.description,
            )
            for p in perms
        ]
        return Paginated[PermissionResponse](
            items=items, total=total, skip=skip, limit=limit
        )

    async def assign_permissions(
        self, role_id: UUID, tenant_id: UUID, data: AssignPermissionsRequest
    ) -> list[Permission]:
        role = await self.get_role_with_permissions(role_id, tenant_id)
        if role.is_system:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify permissions of system roles",
            )
        existing_ids = await self.repo.get_role_permission_ids(role_id)
        added: list[Permission] = []
        for pid in data.permission_ids:
            if pid in existing_ids:
                continue
            perm = await self.repo.get_permission_by_id(pid)
            if not perm:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Permission {pid} not found",
                )
            await self.repo.add_role_permission(role_id, pid)
            added.append(perm)
        return added

    async def revoke_permission(
        self, role_id: UUID, permission_id: UUID, tenant_id: UUID
    ) -> None:
        role = await self.get_role_with_permissions(role_id, tenant_id)
        if role.is_system:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify permissions of system roles",
            )
        removed = await self.repo.remove_role_permission(role_id, permission_id)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Permission not assigned to this role",
            )
