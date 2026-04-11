from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.roles.models import Permission, Role, RolePermission


class RoleRepository:
    """Repository for Role and Permission models."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_role_by_id(self, role_id: UUID) -> Role | None:
        result = await self.session.execute(select(Role).where(Role.id == role_id))
        return result.scalar_one_or_none()

    async def get_role_by_slug(
        self, tenant_id: UUID | None, slug: str
    ) -> Role | None:
        result = await self.session.execute(
            select(Role).where(
                Role.tenant_id == tenant_id,
                Role.slug == slug,
            )
        )
        return result.scalar_one_or_none()

    async def list_roles(
        self,
        tenant_id: UUID | None,
        *,
        include_inactive: bool = False,
    ) -> list[Role]:
        query = select(Role).where(Role.tenant_id == tenant_id)
        if not include_inactive:
            query = query.where(Role.is_active == True)
        query = query.order_by(Role.is_system.desc(), Role.name)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_roles_page(
        self,
        tenant_id: UUID | None,
        *,
        include_inactive: bool = False,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Role], int]:
        conditions = [Role.tenant_id == tenant_id]
        if not include_inactive:
            conditions.append(Role.is_active == True)  # noqa: E712
        count_stmt = select(func.count()).select_from(Role).where(*conditions)
        total = int((await self.session.execute(count_stmt)).scalar() or 0)
        query = (
            select(Role)
            .where(*conditions)
            .order_by(Role.is_system.desc(), Role.name)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all()), total

    async def create_role(self, role: Role) -> Role:
        self.session.add(role)
        await self.session.flush()
        await self.session.refresh(role)
        return role

    async def list_permissions(self) -> list[Permission]:
        result = await self.session.execute(
            select(Permission).order_by(Permission.resource, Permission.action)
        )
        return list(result.scalars().all())

    async def list_permissions_page(
        self,
        *,
        skip: int = 0,
        limit: int = 200,
    ) -> tuple[list[Permission], int]:
        count_stmt = select(func.count()).select_from(Permission)
        total = int((await self.session.execute(count_stmt)).scalar() or 0)
        result = await self.session.execute(
            select(Permission)
            .order_by(Permission.resource, Permission.action)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def get_permission_by_id(self, permission_id: UUID) -> Permission | None:
        result = await self.session.execute(
            select(Permission).where(Permission.id == permission_id)
        )
        return result.scalar_one_or_none()

    async def get_permission_by_resource_action(
        self, resource: str, action: str
    ) -> Permission | None:
        result = await self.session.execute(
            select(Permission).where(
                Permission.resource == resource,
                Permission.action == action,
            )
        )
        return result.scalar_one_or_none()

    async def get_role_permissions(self, role_id: UUID) -> list[Permission]:
        result = await self.session.execute(
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
        )
        return list(result.scalars().all())

    async def get_role_permission_ids(self, role_id: UUID) -> set[UUID]:
        result = await self.session.execute(
            select(RolePermission.permission_id).where(
                RolePermission.role_id == role_id
            )
        )
        return {row[0] for row in result.all()}

    async def add_role_permission(
        self, role_id: UUID, permission_id: UUID
    ) -> RolePermission:
        rp = RolePermission(role_id=role_id, permission_id=permission_id)
        self.session.add(rp)
        await self.session.flush()
        await self.session.refresh(rp)
        return rp

    async def remove_role_permission(
        self, role_id: UUID, permission_id: UUID
    ) -> bool:
        result = await self.session.execute(
            select(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id,
            )
        )
        rp = result.scalar_one_or_none()
        if rp:
            await self.session.delete(rp)
            await self.session.flush()
            return True
        return False
