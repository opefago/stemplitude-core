"""Tenant service."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity, TenantContext
from app.licenses.models import License, SeatUsage
from app.roles.models import Permission, Role, RolePermission, UserRole
from app.roles.defaults import DEFAULT_ROLES as ROLE_PERMISSION_MAP
from app.students.models import StudentMembership
from app.tenants.models import Membership, SupportAccessGrant, Tenant, TenantHierarchy, TenantLabSetting
from app.users.models import User

from .repository import (
    MembershipRepository,
    SupportAccessGrantRepository,
    TenantHierarchyRepository,
    TenantLabSettingRepository,
    TenantRepository,
)
from .schemas import (
    ChildSeatUsage,
    ChildTenantCreate,
    HierarchyUpdate,
    LabSettingUpdate,
    MemberAdd,
    MemberRoleUpdate,
    SeatDetail,
    SeatMonitorResponse,
    StudentPolicies,
    StudentPoliciesUpdate,
    SupportAccessGrantCreate,
    TenantCreate,
    TenantUpdate,
)

logger = logging.getLogger(__name__)

# Derive seeded role slugs+names directly from the single source of truth.
# Add new roles to roles/defaults.py and they'll be picked up automatically.
_ROLE_SLUGS = [(slug, meta["name"]) for slug, meta in ROLE_PERMISSION_MAP.items()]


class TenantService:
    """Tenant business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = TenantRepository(session)
        self.membership_repo = MembershipRepository(session)
        self.lab_repo = TenantLabSettingRepository(session)
        self.grant_repo = SupportAccessGrantRepository(session)
        self.hierarchy_repo = TenantHierarchyRepository(session)

    async def _seed_default_roles(self, tenant_id: UUID) -> None:
        """Create default roles and assign their permissions for a new tenant."""
        # Fetch the global permission catalogue once
        perm_result = await self.session.execute(select(Permission))
        perms_by_key: dict[str, Permission] = {
            f"{p.resource}:{p.action}": p for p in perm_result.scalars().all()
        }

        for slug, name in _ROLE_SLUGS:
            role = Role(
                tenant_id=tenant_id,
                name=name,
                slug=slug,
                is_system=True,
            )
            self.session.add(role)
            await self.session.flush()  # get role.id

            # Assign permissions defined in defaults.py for this slug
            perm_keys: list[str] = ROLE_PERMISSION_MAP.get(slug, {}).get("permissions", [])
            for key in perm_keys:
                perm = perms_by_key.get(key)
                if perm:
                    self.session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    async def create_tenant(
        self,
        data: TenantCreate,
        created_by_user_id: UUID,
    ) -> Tenant:
        """Create tenant and seed default roles."""
        tenant = await self.repo.create(
            name=data.name,
            slug=data.slug,
            code=data.code.upper(),
            type=data.type,
            logo_url=data.logo_url,
            settings=data.settings or {},
            is_active=data.is_active,
        )
        await self._seed_default_roles(tenant.id)
        # Add creator as admin
        admin_role_result = await self.session.execute(
            select(Role).where(
                Role.tenant_id == tenant.id,
                Role.slug == "admin",
            )
        )
        admin_role = admin_role_result.scalar_one_or_none()
        if admin_role:
            await self.membership_repo.add_member(
                created_by_user_id, tenant.id, admin_role.id
            )
        logger.info("Tenant created name=%s id=%s", tenant.name, tenant.id)
        return tenant

    async def list_user_tenants(self, user_id: UUID) -> list[Tenant]:
        """List tenants the user belongs to."""
        return await self.repo.list_user_tenants(user_id)

    async def get_tenant(self, tenant_id: UUID) -> Tenant | None:
        """Get tenant by ID."""
        return await self.repo.get_by_id(tenant_id)

    async def update_tenant(self, tenant_id: UUID, data: TenantUpdate) -> Tenant | None:
        """Update tenant."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            logger.warning("Tenant update failed: tenant not found id=%s", tenant_id)
            return None
        update_data = data.model_dump(exclude_unset=True)
        if "code" in update_data:
            update_data["code"] = update_data["code"].upper()
        for k, v in update_data.items():
            setattr(tenant, k, v)
        await self.session.flush()
        await self.session.refresh(tenant)
        logger.info("Tenant updated id=%s", tenant_id)
        if "is_active" in update_data:
            if update_data["is_active"]:
                logger.info("Tenant activated id=%s", tenant_id)
            else:
                logger.info("Tenant deactivated id=%s", tenant_id)
        return tenant

    def _get_student_policies(self, tenant: Tenant) -> StudentPolicies:
        """Extract student policies from tenant settings."""
        settings = tenant.settings or {}
        policies = settings.get("student_policies", {})
        return StudentPolicies(
            allow_self_registration=policies.get("allow_self_registration", False),
            require_approval=policies.get("require_approval", True),
            max_projects_per_student=policies.get("max_projects_per_student"),
            default_role_slug=policies.get("default_role_slug", "student"),
        )

    async def get_student_policies(self, tenant_id: UUID) -> StudentPolicies | None:
        """Get student policies for a tenant."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            return None
        return self._get_student_policies(tenant)

    async def update_student_policies(
        self, tenant_id: UUID, data: StudentPoliciesUpdate
    ) -> StudentPolicies | None:
        """Update student policies."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            return None
        settings = tenant.settings or {}
        policies = settings.get("student_policies", {})
        update_data = data.model_dump(exclude_unset=True)
        policies.update(update_data)
        settings["student_policies"] = policies
        tenant.settings = settings
        await self.session.flush()
        await self.session.refresh(tenant)
        return self._get_student_policies(tenant)

    async def add_member(self, tenant_id: UUID, data: MemberAdd) -> Membership | None:
        """Add a member to a tenant."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            return None
        existing = await self.membership_repo.get_by_user_tenant(data.user_id, tenant_id)
        if existing:
            return None  # Already a member
        return await self.membership_repo.add_member(
            data.user_id, tenant_id, data.role_id
        )

    async def list_members(self, tenant_id: UUID) -> list[tuple[Membership, object, Role | None]]:
        """List tenant members with user and role."""
        return await self.membership_repo.list_tenant_members(tenant_id)

    async def update_member_role(
        self, tenant_id: UUID, user_id: UUID, data: MemberRoleUpdate
    ) -> Membership | None:
        """Change member role."""
        membership = await self.membership_repo.get_by_user_tenant(user_id, tenant_id)
        if not membership:
            return None
        return await self.membership_repo.update_role(membership, data.role_id)

    async def remove_member(self, tenant_id: UUID, user_id: UUID) -> bool:
        """Remove a member from a tenant."""
        membership = await self.membership_repo.get_by_user_tenant(user_id, tenant_id)
        if not membership:
            return False
        await self.membership_repo.deactivate(membership)
        return True

    async def list_lab_settings(self, tenant_id: UUID) -> list[TenantLabSetting]:
        """List lab settings for a tenant."""
        return await self.lab_repo.list_by_tenant(tenant_id)

    async def update_lab_setting(
        self, tenant_id: UUID, data: LabSettingUpdate
    ) -> TenantLabSetting | None:
        """Toggle or update a lab setting."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            return None
        return await self.lab_repo.upsert(
            tenant_id, data.lab_type, data.enabled, data.config
        )

    async def grant_support_access(
        self,
        tenant_id: UUID,
        data: SupportAccessGrantCreate,
        granted_by: UUID,
    ) -> SupportAccessGrant | None:
        """Grant support access to a tenant."""
        tenant = await self.repo.get_by_id(tenant_id)
        if not tenant:
            return None
        if not data.role_id:
            raise ValueError("A tenant role scope is required for support access")
        if data.expires_at <= datetime.now(timezone.utc):
            raise ValueError("Support access expiration must be in the future")

        support_user = await self.session.get(User, data.support_user_id)
        if not support_user or not support_user.is_active or not support_user.is_super_admin:
            raise ValueError("Support user must be an active super admin")

        global_role_result = await self.session.execute(
            select(UserRole.id)
            .join(Role, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == data.support_user_id,
                UserRole.is_active == True,
                Role.tenant_id.is_(None),
                Role.is_active == True,
            )
            .limit(1)
        )
        if global_role_result.scalar_one_or_none() is None:
            raise ValueError("Support user must have an active platform role")

        tenant_role = await self.session.get(Role, data.role_id)
        if not tenant_role or tenant_role.tenant_id != tenant_id or not tenant_role.is_active:
            raise ValueError("Selected tenant role is invalid")

        return await self.grant_repo.create(
            tenant_id=tenant_id,
            granted_by=granted_by,
            support_user_id=data.support_user_id,
            role_id=data.role_id,
            reason=data.reason,
            expires_at=data.expires_at,
        )

    async def list_support_grants(self, tenant_id: UUID) -> list[SupportAccessGrant]:
        """List support access grants for a tenant."""
        return await self.grant_repo.list_by_tenant(tenant_id)

    async def get_support_grant(
        self, tenant_id: UUID, grant_id: UUID
    ) -> SupportAccessGrant | None:
        """Get support grant details."""
        grant = await self.grant_repo.get_by_id(grant_id)
        if not grant or grant.tenant_id != tenant_id:
            return None
        return grant

    async def revoke_support_grant(
        self, tenant_id: UUID, grant_id: UUID, revoked_by: UUID
    ) -> SupportAccessGrant | None:
        """Revoke a support access grant."""
        grant = await self.grant_repo.get_by_id(grant_id)
        if not grant or grant.tenant_id != tenant_id or grant.status != "active":
            return None
        return await self.grant_repo.revoke(grant, revoked_by)

    async def list_support_access_options(self, tenant_id: UUID) -> dict[str, list[dict[str, str | None]]]:
        """List platform support users and tenant roles available for support grants."""
        support_users_result = await self.session.execute(
            select(
                User.id,
                User.email,
                User.first_name,
                User.last_name,
                Role.slug,
            )
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, UserRole.role_id == Role.id)
            .where(
                User.is_active == True,
                User.is_super_admin == True,
                UserRole.is_active == True,
                Role.tenant_id.is_(None),
                Role.is_active == True,
            )
            .order_by(User.first_name, User.last_name, User.email)
        )

        roles_result = await self.session.execute(
            select(Role.id, Role.slug, Role.name)
            .where(
                Role.tenant_id == tenant_id,
                Role.is_active == True,
            )
            .order_by(Role.is_system.desc(), Role.name.asc())
        )

        return {
            "support_users": [
                {
                    "id": str(row.id),
                    "email": row.email,
                    "first_name": row.first_name,
                    "last_name": row.last_name,
                    "global_role": row.slug,
                }
                for row in support_users_result.all()
            ],
            "roles": [
                {
                    "id": str(row.id),
                    "slug": row.slug,
                    "name": row.name,
                }
                for row in roles_result.all()
            ],
        }

    # --- Hierarchy ---

    async def add_child_tenant(
        self, parent_id: UUID, data: ChildTenantCreate
    ) -> TenantHierarchy:
        """Link an existing tenant as a child. Enforces two-level limit."""
        parent = await self.repo.get_by_id(parent_id)
        if not parent:
            logger.warning("Hierarchy violation: parent tenant not found parent=%s", parent_id)
            raise ValueError("Parent tenant not found")

        if await self.hierarchy_repo.is_already_child(parent_id):
            logger.warning("Hierarchy violation: parent is already a child tenant parent=%s", parent_id)
            raise ValueError("Parent is already a child tenant -- only two levels allowed")

        child = await self.repo.get_by_id(data.child_tenant_id)
        if not child:
            logger.warning("Hierarchy violation: child tenant not found child=%s", data.child_tenant_id)
            raise ValueError("Child tenant not found")

        if await self.hierarchy_repo.is_already_child(data.child_tenant_id):
            logger.warning("Hierarchy violation: tenant is already a child of another parent child=%s", data.child_tenant_id)
            raise ValueError("This tenant is already a child of another parent")

        if await self.hierarchy_repo.is_parent(data.child_tenant_id):
            logger.warning("Hierarchy violation: tenant already has children child=%s", data.child_tenant_id)
            raise ValueError("This tenant already has children -- cannot make it a child (two-level limit)")

        if parent_id == data.child_tenant_id:
            logger.warning("Hierarchy violation: tenant cannot be its own child parent=%s", parent_id)
            raise ValueError("A tenant cannot be its own child")

        link = await self.hierarchy_repo.create(
            parent_tenant_id=parent_id,
            child_tenant_id=data.child_tenant_id,
            billing_mode=data.billing_mode,
            seat_allocations=data.seat_allocations,
        )
        logger.info("Child tenant added parent=%s child=%s billing=%s", parent_id, data.child_tenant_id, data.billing_mode)
        return link

    async def list_children(self, parent_id: UUID) -> list[TenantHierarchy]:
        return await self.hierarchy_repo.list_children(parent_id)

    async def get_hierarchy_link(self, parent_id: UUID, child_id: UUID) -> TenantHierarchy | None:
        link = await self.hierarchy_repo.get_by_child(child_id)
        if link and link.parent_tenant_id == parent_id:
            return link
        return None

    async def update_hierarchy(
        self, parent_id: UUID, child_id: UUID, data: HierarchyUpdate
    ) -> TenantHierarchy | None:
        link = await self.get_hierarchy_link(parent_id, child_id)
        if not link:
            logger.warning("Hierarchy update failed: link not found parent=%s child=%s", parent_id, child_id)
            return None
        update_data = data.model_dump(exclude_unset=True)
        result = await self.hierarchy_repo.update(link, **update_data)
        logger.info("Hierarchy updated parent=%s child=%s", parent_id, child_id)
        return result

    async def remove_child(self, parent_id: UUID, child_id: UUID) -> bool:
        link = await self.get_hierarchy_link(parent_id, child_id)
        if not link:
            logger.warning("Child tenant removal failed: link not found parent=%s child=%s", parent_id, child_id)
            return False
        link.is_active = False
        await self.session.flush()
        logger.info("Child tenant removed parent=%s child=%s", parent_id, child_id)
        return True

    async def get_seat_monitor(self, parent_id: UUID) -> SeatMonitorResponse:
        """Build a seat monitoring dashboard for a parent tenant."""
        children = await self.hierarchy_repo.list_children(parent_id)
        logger.debug("Seat monitor queried parent=%s children=%d", parent_id, len(children))
        parent_license = await self._get_active_license(parent_id)
        parent_license_seats: dict[str, int] = {}
        if parent_license:
            for seat in parent_license.seat_usages:
                parent_license_seats[seat.seat_type] = seat.max_count

        total_allocated: dict[str, int] = {}
        total_used: dict[str, int] = {}
        child_usages: list[ChildSeatUsage] = []

        for link in children:
            child = await self.repo.get_by_id(link.child_tenant_id)
            if not child:
                continue

            seats_detail: dict[str, SeatDetail] = {}
            current_counts = await self._count_seats_for_tenant(link.child_tenant_id)

            if link.billing_mode == "central":
                alloc = link.seat_allocations or {}
                for seat_type, current in current_counts.items():
                    allocated = alloc.get(seat_type)
                    max_from_license = parent_license_seats.get(seat_type)
                    seats_detail[seat_type] = SeatDetail(
                        current=current,
                        allocated=allocated,
                        max_from_license=max_from_license,
                    )
                    total_used[seat_type] = total_used.get(seat_type, 0) + current
                    if allocated is not None:
                        total_allocated[seat_type] = total_allocated.get(seat_type, 0) + allocated
            else:
                child_license = await self._get_active_license(link.child_tenant_id)
                child_seats: dict[str, int] = {}
                if child_license:
                    for s in child_license.seat_usages:
                        child_seats[s.seat_type] = s.max_count
                for seat_type, current in current_counts.items():
                    seats_detail[seat_type] = SeatDetail(
                        current=current,
                        allocated=None,
                        max_from_license=child_seats.get(seat_type),
                    )

            child_usages.append(ChildSeatUsage(
                child_tenant_id=link.child_tenant_id,
                child_name=child.name,
                billing_mode=link.billing_mode,
                seats=seats_detail,
            ))

        unallocated: dict[str, int] = {}
        for seat_type, max_val in parent_license_seats.items():
            unallocated[seat_type] = max_val - total_allocated.get(seat_type, 0)

        return SeatMonitorResponse(
            parent_tenant_id=parent_id,
            parent_license_seats=parent_license_seats,
            total_allocated=total_allocated,
            total_used=total_used,
            unallocated=unallocated,
            children=child_usages,
        )

    async def _get_active_license(self, tenant_id: UUID) -> License | None:
        result = await self.session.execute(
            select(License).where(
                License.tenant_id == tenant_id,
                License.status == "active",
            )
        )
        return result.scalar_one_or_none()

    async def _count_seats_for_tenant(self, tenant_id: UUID) -> dict[str, int]:
        """Count actual seat usage by querying memberships and student enrollments."""
        student_result = await self.session.execute(
            select(func.count(StudentMembership.id)).where(
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
            )
        )
        student_count = student_result.scalar() or 0

        instructor_result = await self.session.execute(
            select(func.count(Membership.id))
            .join(Role, Role.id == Membership.role_id, isouter=True)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
                Role.slug == "instructor",
            )
        )
        instructor_count = instructor_result.scalar() or 0

        return {"student": student_count, "instructor": instructor_count}
