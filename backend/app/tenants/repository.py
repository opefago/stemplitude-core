"""Tenant repository."""

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.repository import BaseRepository
from app.tenants.models import Membership, SupportAccessGrant, Tenant, TenantHierarchy, TenantLabSetting
from app.users.models import User
from app.roles.models import Role


class TenantRepository(BaseRepository[Tenant]):
    """Repository for tenant queries."""

    def __init__(self, session: AsyncSession):
        super().__init__(session, Tenant)

    async def get_by_id(self, tenant_id: UUID) -> Tenant | None:
        """Get tenant by ID."""
        result = await self.session.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Tenant | None:
        """Get tenant by slug."""
        result = await self.session.execute(select(Tenant).where(Tenant.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Tenant | None:
        """Get tenant by code."""
        result = await self.session.execute(select(Tenant).where(Tenant.code == code))
        return result.scalar_one_or_none()

    async def list_user_tenants(self, user_id: UUID) -> list[Tenant]:
        """List tenants the user is a member of."""
        result = await self.session.execute(
            select(Tenant)
            .join(Membership, Membership.tenant_id == Tenant.id)
            .where(
                Membership.user_id == user_id,
                Membership.is_active == True,
                Tenant.is_active == True,
            )
            .order_by(Tenant.name)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Tenant:
        """Create a tenant."""
        tenant = Tenant(**kwargs)
        self.session.add(tenant)
        await self.session.flush()
        return tenant


class MembershipRepository:
    """Repository for membership queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_user_tenant(self, user_id: UUID, tenant_id: UUID) -> Membership | None:
        """Get membership by user and tenant."""
        result = await self.session.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_tenant_members(self, tenant_id: UUID) -> list[tuple[Membership, User, Role | None]]:
        """List members of a tenant with user and role."""
        result = await self.session.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .outerjoin(Role, Role.id == Membership.role_id)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
            )
        )
        return [(r[0], r[1], r[2]) for r in result.all()]

    async def add_member(self, user_id: UUID, tenant_id: UUID, role_id: UUID | None) -> Membership:
        """Add a member to a tenant."""
        membership = Membership(
            user_id=user_id,
            tenant_id=tenant_id,
            role_id=role_id,
        )
        self.session.add(membership)
        await self.session.flush()
        return membership

    async def update_role(self, membership: Membership, role_id: UUID | None) -> Membership:
        """Update member role."""
        membership.role_id = role_id
        await self.session.flush()
        await self.session.refresh(membership)
        return membership

    async def deactivate(self, membership: Membership) -> None:
        """Deactivate (remove) a member."""
        membership.is_active = False
        await self.session.flush()


class TenantLabSettingRepository:
    """Repository for tenant lab settings."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_tenant_lab(self, tenant_id: UUID, lab_type: str) -> TenantLabSetting | None:
        """Get lab setting by tenant and lab type."""
        result = await self.session.execute(
            select(TenantLabSetting).where(
                TenantLabSetting.tenant_id == tenant_id,
                TenantLabSetting.lab_type == lab_type,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_tenant(self, tenant_id: UUID) -> list[TenantLabSetting]:
        """List all lab settings for a tenant."""
        result = await self.session.execute(
            select(TenantLabSetting).where(TenantLabSetting.tenant_id == tenant_id)
        )
        return list(result.scalars().all())

    async def upsert(self, tenant_id: UUID, lab_type: str, enabled: bool, config: dict | None = None) -> TenantLabSetting:
        """Create or update lab setting."""
        existing = await self.get_by_tenant_lab(tenant_id, lab_type)
        if existing:
            existing.enabled = enabled
            if config is not None:
                existing.config = config or {}
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        setting = TenantLabSetting(
            tenant_id=tenant_id,
            lab_type=lab_type,
            enabled=enabled,
            config=config or {},
        )
        self.session.add(setting)
        await self.session.flush()
        return setting


class SupportAccessGrantRepository:
    """Repository for support access grants."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, grant_id: UUID) -> SupportAccessGrant | None:
        """Get grant by ID."""
        result = await self.session.execute(
            select(SupportAccessGrant).where(SupportAccessGrant.id == grant_id)
        )
        return result.scalar_one_or_none()

    async def list_by_tenant(self, tenant_id: UUID) -> list[SupportAccessGrant]:
        """List grants for a tenant."""
        result = await self.session.execute(
            select(SupportAccessGrant).where(SupportAccessGrant.tenant_id == tenant_id)
        )
        return list(result.scalars().all())

    async def create(
        self,
        tenant_id: UUID,
        granted_by: UUID,
        support_user_id: UUID,
        role_id: UUID | None,
        reason: str | None,
        expires_at,
    ) -> SupportAccessGrant:
        """Create a support access grant."""
        grant = SupportAccessGrant(
            tenant_id=tenant_id,
            granted_by=granted_by,
            support_user_id=support_user_id,
            role_id=role_id,
            reason=reason,
            expires_at=expires_at,
            status="active",
        )
        self.session.add(grant)
        await self.session.flush()
        return grant

    async def revoke(self, grant: SupportAccessGrant, revoked_by: UUID) -> SupportAccessGrant:
        """Revoke a grant."""
        from datetime import datetime, timezone

        grant.status = "revoked"
        grant.revoked_at = datetime.now(timezone.utc)
        grant.revoked_by = revoked_by
        await self.session.flush()
        await self.session.refresh(grant)
        return grant


class TenantHierarchyRepository:
    """Repository for tenant hierarchy queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_child(self, child_tenant_id: UUID) -> TenantHierarchy | None:
        result = await self.session.execute(
            select(TenantHierarchy).where(
                TenantHierarchy.child_tenant_id == child_tenant_id,
                TenantHierarchy.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, hierarchy_id: UUID) -> TenantHierarchy | None:
        result = await self.session.execute(
            select(TenantHierarchy).where(TenantHierarchy.id == hierarchy_id)
        )
        return result.scalar_one_or_none()

    async def list_children(self, parent_tenant_id: UUID) -> list[TenantHierarchy]:
        result = await self.session.execute(
            select(TenantHierarchy).where(
                TenantHierarchy.parent_tenant_id == parent_tenant_id,
            ).order_by(TenantHierarchy.created_at)
        )
        return list(result.scalars().all())

    async def get_parent(self, child_tenant_id: UUID) -> TenantHierarchy | None:
        """Get the active hierarchy link for a child (to find its parent)."""
        return await self.get_by_child(child_tenant_id)

    async def is_already_child(self, tenant_id: UUID) -> bool:
        """Check if a tenant is already a child of some parent."""
        result = await self.session.execute(
            select(TenantHierarchy).where(
                TenantHierarchy.child_tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def is_parent(self, tenant_id: UUID) -> bool:
        """Check if a tenant is already a parent."""
        result = await self.session.execute(
            select(TenantHierarchy).where(
                TenantHierarchy.parent_tenant_id == tenant_id,
                TenantHierarchy.is_active == True,
            )
        )
        return result.first() is not None

    async def create(
        self,
        parent_tenant_id: UUID,
        child_tenant_id: UUID,
        billing_mode: str,
        seat_allocations: dict | None,
    ) -> TenantHierarchy:
        link = TenantHierarchy(
            parent_tenant_id=parent_tenant_id,
            child_tenant_id=child_tenant_id,
            billing_mode=billing_mode,
            seat_allocations=seat_allocations,
        )
        self.session.add(link)
        await self.session.flush()
        return link

    async def update(self, link: TenantHierarchy, **kwargs) -> TenantHierarchy:
        for k, v in kwargs.items():
            if v is not None:
                setattr(link, k, v)
        await self.session.flush()
        await self.session.refresh(link)
        return link

    async def list_central_children_ids(self, parent_tenant_id: UUID) -> list[UUID]:
        """Get IDs of all centrally-billed children."""
        result = await self.session.execute(
            select(TenantHierarchy.child_tenant_id).where(
                TenantHierarchy.parent_tenant_id == parent_tenant_id,
                TenantHierarchy.billing_mode == "central",
                TenantHierarchy.is_active == True,
            )
        )
        return list(result.scalars().all())


def slugify(text: str) -> str:
    """Generate URL-safe slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or "tenant"
