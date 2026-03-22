from functools import wraps
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_optional_bearer = HTTPBearer(auto_error=False)


def require_permission(resource: str, action: str):
    """FastAPI dependency that checks role-based permissions."""

    async def _check(
        request: Request,
        _credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    ) -> None:
        identity = getattr(request.state, "current_identity", None)
        if identity is None:
            auth_error = getattr(request.state, "auth_error", None)
            if auth_error:
                detail = auth_error
            elif not request.headers.get("Authorization"):
                detail = "Authorization header required"
            else:
                detail = "Invalid or expired token"
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

        if getattr(identity, "is_super_admin", False):
            return

        tenant_ctx = getattr(request.state, "tenant", None)
        if tenant_ctx is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="X-Tenant-ID header required",
            )

        if identity.sub_type == "student":
            _STUDENT_ALLOWED = {
                ("progress", "view"),
                ("progress", "create"),
                ("labs", "view"),
                ("labs", "create"),
                ("assets", "view"),
                ("assets", "create"),
                ("notifications", "view"),
                ("notifications", "update"),
                ("gamification", "view"),
            }
            if (resource, action) not in _STUDENT_ALLOWED:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Students cannot perform this action",
                )
            return

        permissions = getattr(tenant_ctx, "permissions", set())
        required = f"{resource}:{action}"
        if required not in permissions and f"{resource}:*" not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {required}",
            )

    return Depends(_check)


def require_super_admin():
    """FastAPI dependency that requires super admin status."""

    async def _check(
        request: Request,
        _credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    ) -> None:
        identity = getattr(request.state, "current_identity", None)
        if identity is None:
            auth_error = getattr(request.state, "auth_error", None)
            if auth_error:
                detail = auth_error
            elif not request.headers.get("Authorization"):
                detail = "Authorization header required"
            else:
                detail = "Invalid or expired token"
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
        if not getattr(identity, "is_super_admin", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin access required",
            )

    return Depends(_check)


def require_global_permission(resource: str, action: str):
    """FastAPI dependency that checks for a specific global (platform-level) permission."""

    async def _check(
        request: Request,
        _credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    ) -> None:
        identity = getattr(request.state, "current_identity", None)
        if identity is None:
            auth_error = getattr(request.state, "auth_error", None)
            if auth_error:
                detail = auth_error
            elif not request.headers.get("Authorization"):
                detail = "Authorization header required"
            else:
                detail = "Invalid or expired token"
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

        if getattr(identity, "is_super_admin", False):
            return

        global_perms = getattr(identity, "global_permissions", [])
        required = f"{resource}:{action}"
        wildcard = f"{resource}:*"
        if required not in global_perms and wildcard not in global_perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing global permission: {required}",
            )

    return Depends(_check)
