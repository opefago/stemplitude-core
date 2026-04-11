import logging
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.redis import get_redis
from app.middleware.path_skips import request_context_middleware_skip_paths
from app.core.security import decode_token
from app.dependencies import BLACKLIST_JTI_PREFIX, CurrentIdentity

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Extracts JWT and attaches CurrentIdentity to request.state.

    Runs before TenantMiddleware so tenant resolution can reference the identity.
    """

    SKIP_PATHS = request_context_middleware_skip_paths()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header[7:]
        payload = decode_token(token)
        if not payload or not payload.get("sub"):
            request.state.auth_error = "Invalid or expired token"
            return await call_next(request)

        if payload.get("type") != "access":
            request.state.auth_error = "Token type must be 'access'"
            return await call_next(request)

        jti = payload.get("jti")
        if jti:
            redis = await get_redis()
            if await redis.get(f"{BLACKLIST_JTI_PREFIX}{jti}"):
                logger.info("Token JTI is blacklisted jti=%s", jti)
                request.state.auth_error = "Token has been revoked"
                return await call_next(request)

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
            identity.grant_id = (
                UUID(payload["grant_id"]) if payload.get("grant_id") else None
            )
            identity.tenant_id = (
                UUID(payload["impersonated_tenant_id"])
                if payload.get("impersonated_tenant_id")
                else None
            )
            logger.info("Impersonation identity created", extra={"grant_id": str(identity.grant_id) if identity.grant_id else None})
        logger.debug("JWT decoded successfully", extra={"user_id": payload["sub"], "sub_type": sub_type})
        request.state.current_identity = identity

        return await call_next(request)
