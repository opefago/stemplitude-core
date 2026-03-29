import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.database import async_session_factory
from app.middleware.path_skips import tenant_middleware_skip_paths
from app.dependencies import TenantContext
from app.roles.defaults import DEFAULT_ROLES
from app.students.parent_access import guardian_may_use_child_context_in_tenant
from app.tenants.service import TenantService
from app.tenants.models import Tenant, Membership, TenantHierarchy
from app.students.models import StudentMembership
from app.roles.models import Role, RolePermission, Permission

logger = logging.getLogger(__name__)

NOTIFICATION_INBOX_PERMISSIONS = frozenset(
    {"notifications:view", "notifications:update"}
)

# Seeded roles often omit these; guardians in a child's workspace may have no Membership row.
GUARDIAN_SHELL_EXTRA_PERMISSIONS = frozenset(
    {"tenants:view", *NOTIFICATION_INBOX_PERMISSIONS}
)

PARENT_ROLE_SLUGS_WITH_INBOX = frozenset({"parent", "homeschool_parent"})

# Mark-read / conversation read receipts (routers use messages:update); seeded roles often omitted it.
MESSAGE_RECEIPT_PERMISSIONS = frozenset({"messages:update"})
ROLES_WITH_MESSAGE_RECEIPTS = frozenset({"parent", "homeschool_parent", "instructor"})


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolves X-Tenant-ID header (UUID, slug, or code) and attaches TenantContext."""

    SKIP_PATHS = tenant_middleware_skip_paths()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        tenant_header = request.headers.get("X-Tenant-ID")
        if not tenant_header:
            return await call_next(request)

        async with async_session_factory() as session:
            tenant = await self._resolve_tenant(session, tenant_header)
            if not tenant:
                logger.warning("Tenant not found", extra={"identifier": tenant_header})
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"Tenant not found: {tenant_header}"},
                )
            logger.debug("Tenant resolved", extra={"tenant_slug": tenant.slug})

            identity = getattr(request.state, "current_identity", None)
            role_slug = None
            permissions: set[str] = set()

            if identity:
                if identity.sub_type == "user":
                    tenant_service = TenantService(session)
                    if await tenant_service.ensure_linked_parent_membership(
                        identity.id, tenant.id
                    ):
                        await session.commit()
                    role_slug, permissions = await self._resolve_user_role(
                        session, identity.id, tenant.id
                    )
                elif identity.sub_type == "student":
                    role_slug = await self._resolve_student_role(
                        session, identity.id, tenant.id
                    )
                elif identity.sub_type == "impersonation":
                    role_slug, permissions = await self._resolve_impersonation_role(
                        session, identity
                    )

            if (
                identity
                and identity.sub_type == "user"
                and role_slug in PARENT_ROLE_SLUGS_WITH_INBOX
            ):
                permissions = set(permissions) | NOTIFICATION_INBOX_PERMISSIONS

            if (
                identity
                and identity.sub_type == "user"
                and role_slug in ROLES_WITH_MESSAGE_RECEIPTS
            ):
                permissions = set(permissions) | MESSAGE_RECEIPT_PERMISSIONS

            if identity and identity.sub_type == "user":
                raw_child = (request.headers.get("X-Child-Context") or "").strip()
                if raw_child:
                    try:
                        child_id = UUID(raw_child)
                    except ValueError:
                        child_id = None
                    if child_id and await guardian_may_use_child_context_in_tenant(
                        session,
                        identity=identity,
                        student_id=child_id,
                        tenant_id=tenant.id,
                    ):
                        perms = set(permissions)
                        if not perms:
                            jwt_role = (identity.role or "parent").strip().lower()
                            if jwt_role not in DEFAULT_ROLES:
                                jwt_role = "parent"
                            perms = set(DEFAULT_ROLES[jwt_role]["permissions"])
                            if not role_slug:
                                role_slug = jwt_role
                        perms |= GUARDIAN_SHELL_EXTRA_PERMISSIONS
                        permissions = perms

            parent_tenant_id = None
            billing_mode = None
            hierarchy_result = await session.execute(
                select(TenantHierarchy).where(
                    TenantHierarchy.child_tenant_id == tenant.id,
                    TenantHierarchy.is_active == True,
                )
            )
            hierarchy = hierarchy_result.scalar_one_or_none()
            if hierarchy:
                parent_tenant_id = hierarchy.parent_tenant_id
                billing_mode = hierarchy.billing_mode
                logger.debug("Hierarchy resolved", extra={"parent_tenant_id": str(parent_tenant_id)})

            logger.debug("Role and permissions resolved", extra={"role_slug": role_slug, "permission_count": len(permissions)})

            request.state.tenant = TenantContext(
                tenant_id=tenant.id,
                tenant_slug=tenant.slug,
                role=role_slug,
                permissions=permissions,
                parent_tenant_id=parent_tenant_id,
                billing_mode=billing_mode,
            )

        return await call_next(request)

    async def _resolve_tenant(self, session, identifier: str) -> Tenant | None:
        try:
            tenant_uuid = UUID(identifier)
            result = await session.execute(
                select(Tenant).where(Tenant.id == tenant_uuid, Tenant.is_active == True)
            )
            return result.scalar_one_or_none()
        except ValueError:
            pass

        result = await session.execute(
            select(Tenant).where(Tenant.slug == identifier, Tenant.is_active == True)
        )
        tenant = result.scalar_one_or_none()
        if tenant:
            return tenant

        result = await session.execute(
            select(Tenant).where(Tenant.code == identifier, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def _resolve_user_role(
        self, session, user_id: UUID, tenant_id: UUID
    ) -> tuple[str | None, set[str]]:
        result = await session.execute(
            select(Membership, Role)
            .join(Role, Membership.role_id == Role.id, isouter=True)
            .where(
                Membership.user_id == user_id,
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
            )
        )
        row = result.first()
        if not row:
            return None, set()

        membership, role = row
        if not role:
            return None, set()

        perm_result = await session.execute(
            select(Permission.resource, Permission.action)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        )
        permissions = {f"{r}:{a}" for r, a in perm_result.all()}
        return role.slug, permissions

    async def _resolve_student_role(
        self, session, student_id: UUID, tenant_id: UUID
    ) -> str | None:
        result = await session.execute(
            select(StudentMembership.role).where(
                StudentMembership.student_id == student_id,
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
            )
        )
        row = result.scalar_one_or_none()
        return row

    async def _resolve_impersonation_role(
        self, session, identity
    ) -> tuple[str | None, set[str]]:
        from app.tenants.models import SupportAccessGrant

        if not identity.grant_id:
            return None, set()

        result = await session.execute(
            select(SupportAccessGrant).where(
                SupportAccessGrant.id == identity.grant_id,
                SupportAccessGrant.status == "active",
                SupportAccessGrant.support_user_id == identity.id,
                SupportAccessGrant.revoked_at.is_(None),
                SupportAccessGrant.expires_at > datetime.now(timezone.utc),
            )
        )
        grant = result.scalar_one_or_none()
        if not grant or not grant.role_id:
            return None, set()

        role_result = await session.execute(
            select(Role).where(Role.id == grant.role_id)
        )
        role = role_result.scalar_one_or_none()
        if not role:
            return None, set()

        perm_result = await session.execute(
            select(Permission.resource, Permission.action)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        )
        permissions = {f"{r}:{a}" for r, a in perm_result.all()}
        return role.slug, permissions
