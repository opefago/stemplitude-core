from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import decode_token
from app.database import get_db

bearer_scheme = HTTPBearer()
BLACKLIST_JTI_PREFIX = "auth:blacklist:jti:"


class CurrentIdentity:
    """Polymorphic identity resolved from JWT -- represents either a user or student."""

    def __init__(
        self,
        id: UUID,
        sub_type: str,
        is_super_admin: bool = False,
        global_account: bool | None = None,
        tenant_id: UUID | None = None,
        role: str | None = None,
        grant_id: UUID | None = None,
        global_permissions: list[str] | None = None,
    ):
        self.id = id
        self.sub_type = sub_type
        self.is_super_admin = is_super_admin
        self.global_account = global_account
        self.tenant_id = tenant_id
        self.role = role
        self.grant_id = grant_id  # for impersonation tokens
        self.global_permissions = global_permissions or []


class TenantContext:
    """Resolved tenant context attached to request state."""

    def __init__(
        self,
        tenant_id: UUID,
        tenant_slug: str,
        role: str | None = None,
        permissions: set[str] | None = None,
        license: dict | None = None,
        parent_tenant_id: UUID | None = None,
        billing_mode: str | None = None,
        governance_mode: str | None = None,
    ):
        self.tenant_id = tenant_id
        self.tenant_slug = tenant_slug
        self.role = role
        self.permissions = permissions or set()
        self.license = license
        self.parent_tenant_id = parent_tenant_id
        self.billing_mode = billing_mode
        self.governance_mode = governance_mode


async def get_current_identity(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentIdentity:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    jti = payload.get("jti")
    if jti:
        redis = await get_redis()
        if await redis.get(f"{BLACKLIST_JTI_PREFIX}{jti}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )

    sub_type = payload.get("sub_type", "user")
    identity = CurrentIdentity(
        id=UUID(payload["sub"]),
        sub_type=sub_type,
        is_super_admin=payload.get("is_super_admin", False),
        tenant_id=UUID(payload["tenant_id"]) if payload.get("tenant_id") else None,
        role=payload.get("role"),
        global_account=payload.get("global_account"),
        global_permissions=payload.get("global_permissions", []),
    )

    if sub_type == "impersonation":
        identity.grant_id = UUID(payload["grant_id"]) if payload.get("grant_id") else None
        identity.tenant_id = (
            UUID(payload["impersonated_tenant_id"]) if payload.get("impersonated_tenant_id") else None
        )

    return identity


def require_identity(request: Request) -> CurrentIdentity:
    """Read the identity set by RequestContextMiddleware with specific errors."""
    identity = getattr(request.state, "current_identity", None)
    if identity is not None:
        return identity
    auth_error = getattr(request.state, "auth_error", None)
    if auth_error:
        detail = auth_error
    elif not request.headers.get("Authorization"):
        detail = "Authorization header required"
    else:
        detail = "Invalid or expired token"
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def get_tenant_context(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    return tenant


def get_optional_tenant_context(request: Request) -> TenantContext | None:
    return getattr(request.state, "tenant", None)
