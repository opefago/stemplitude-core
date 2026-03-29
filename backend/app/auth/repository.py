"""Auth repository -- data access for authentication flows."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.roles.models import Permission, Role, RolePermission, UserRole
from app.students.models import Student, StudentMembership
from app.tenants.models import Membership, SupportAccessGrant, Tenant
from app.users.models import User


class AuthRepository:
    """Data access layer for authentication and identity resolution."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_active_user_by_email(self, email: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.email == email, User.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_active_user_by_id(self, user_id: UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id, User.is_active == True)
        )
        return result.scalar_one_or_none()

    async def create_user(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_active_global_student_by_email(self, email: str) -> Student | None:
        result = await self.session.execute(
            select(Student).where(
                Student.email == email,
                Student.global_account == True,
                Student.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_active_student_by_id(self, student_id: UUID) -> Student | None:
        result = await self.session.execute(
            select(Student).where(Student.id == student_id, Student.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_tenant_scoped_student(
        self, username: str, tenant_id: UUID
    ) -> tuple[Student, StudentMembership] | None:
        """Find a student by username within a specific tenant."""
        result = await self.session.execute(
            select(Student, StudentMembership)
            .join(StudentMembership, StudentMembership.student_id == Student.id)
            .where(
                StudentMembership.username == username,
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
                Student.is_active == True,
            )
        )
        return result.first()

    async def get_student_tenants(self, student_id: UUID) -> list[Tenant]:
        result = await self.session.execute(
            select(Tenant)
            .join(StudentMembership, StudentMembership.tenant_id == Tenant.id)
            .where(
                StudentMembership.student_id == student_id,
                StudentMembership.is_active == True,
                Tenant.is_active == True,
            )
        )
        return list(result.scalars().all())

    async def resolve_tenant(self, identifier: str) -> Tenant | None:
        """Resolve tenant by UUID, slug, or code."""
        try:
            tenant_uuid = UUID(identifier)
            result = await self.session.execute(
                select(Tenant).where(
                    Tenant.id == tenant_uuid, Tenant.is_active == True
                )
            )
            tenant = result.scalar_one_or_none()
            if tenant:
                return tenant
        except ValueError:
            pass

        result = await self.session.execute(
            select(Tenant).where(
                Tenant.slug == identifier, Tenant.is_active == True
            )
        )
        tenant = result.scalar_one_or_none()
        if tenant:
            return tenant

        result = await self.session.execute(
            select(Tenant).where(
                Tenant.code == identifier, Tenant.is_active == True
            )
        )
        return result.scalar_one_or_none()

    async def tenant_slug_exists(self, slug: str) -> bool:
        result = await self.session.execute(
            select(Tenant.id).where(Tenant.slug == slug)
        )
        return result.scalar_one_or_none() is not None

    async def get_active_membership(
        self, user_id: UUID, tenant_id: UUID
    ) -> Membership | None:
        result = await self.session.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_first_user_membership(
        self, user_id: UUID
    ) -> tuple[Membership, Role, Tenant] | None:
        """Get the user's first active membership with resolved role and tenant."""
        result = await self.session.execute(
            select(Membership, Role, Tenant)
            .join(Role, Membership.role_id == Role.id)
            .join(Tenant, Membership.tenant_id == Tenant.id)
            .where(
                Membership.user_id == user_id,
                Membership.is_active == True,
                Tenant.is_active == True,
            )
            .order_by(Membership.created_at)
            .limit(1)
        )
        return result.first()

    async def get_student_membership(
        self, student_id: UUID, tenant_id: UUID
    ) -> StudentMembership | None:
        result = await self.session.execute(
            select(StudentMembership).where(
                StudentMembership.student_id == student_id,
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_first_student_membership(
        self, student_id: UUID
    ) -> tuple[StudentMembership, Tenant] | None:
        result = await self.session.execute(
            select(StudentMembership, Tenant)
            .join(Tenant, StudentMembership.tenant_id == Tenant.id)
            .where(
                StudentMembership.student_id == student_id,
                StudentMembership.is_active == True,
                Tenant.is_active == True,
            )
            .order_by(StudentMembership.enrolled_at)
            .limit(1)
        )
        return result.first()

    async def get_tenant_by_id(self, tenant_id: UUID) -> Tenant | None:
        result = await self.session.execute(
            select(Tenant).where(Tenant.id == tenant_id, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def create_support_access_grant(
        self, grant: SupportAccessGrant
    ) -> SupportAccessGrant:
        self.session.add(grant)
        await self.session.flush()
        return grant

    async def get_active_support_access_grant(
        self,
        support_user_id: UUID,
        tenant_id: UUID,
        *,
        grant_id: UUID | None = None,
    ) -> SupportAccessGrant | None:
        """Get an active, unrevoked, unexpired support grant for a user."""
        stmt = select(SupportAccessGrant).where(
            SupportAccessGrant.support_user_id == support_user_id,
            SupportAccessGrant.tenant_id == tenant_id,
            SupportAccessGrant.status == "active",
            SupportAccessGrant.revoked_at.is_(None),
            SupportAccessGrant.expires_at > datetime.now(timezone.utc),
        )
        if grant_id:
            stmt = stmt.where(SupportAccessGrant.id == grant_id)
        else:
            stmt = stmt.order_by(SupportAccessGrant.expires_at.desc()).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_global_permissions(
        self, user_id: UUID
    ) -> tuple[str | None, str | None, list[str]]:
        """Get user's global (non-tenant) role and permissions.
        Returns (global_role_slug, global_role_name, permissions).
        """
        result = await self.session.execute(
            select(UserRole, Role)
            .join(Role, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user_id,
                UserRole.is_active == True,
                Role.tenant_id.is_(None),
                Role.is_active == True,
            )
            .order_by(UserRole.created_at)
            .limit(1)
        )
        row = result.first()
        if not row:
            return (None, None, [])

        _user_role, role = row
        role_slug = role.slug
        role_name = role.name

        perms_result = await self.session.execute(
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        )
        perms = [
            f"{p.resource}:{p.action}" for p in perms_result.scalars().all()
        ]
        return (role_slug, role_name, perms)
