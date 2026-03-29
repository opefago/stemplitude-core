from __future__ import annotations

import logging
from uuid import UUID

from fastapi import WebSocket

from app.auth.repository import AuthRepository
from app.core.redis import get_redis
from app.core.security import decode_token
from app.database import async_session_factory
from app.dependencies import BLACKLIST_JTI_PREFIX, CurrentIdentity
from app.students.parent_access import guardian_may_use_child_context_in_tenant

logger = logging.getLogger(__name__)


def get_ws_token(websocket: WebSocket) -> str | None:
    auth_header = websocket.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return websocket.query_params.get("token")


def get_ws_tenant(websocket: WebSocket) -> str | None:
    return websocket.headers.get("x-tenant-id") or websocket.query_params.get("tenant_id")


async def decode_ws_identity(token: str) -> CurrentIdentity | None:
    payload = decode_token(token)
    if not payload:
        logger.debug(
            "decode_ws_identity: jwt_unreadable_or_invalid (expired, bad signature, malformed)"
        )
        return None
    if not payload.get("sub"):
        logger.debug("decode_ws_identity: missing sub claim")
        return None
    if payload.get("type") != "access":
        logger.debug(
            "decode_ws_identity: wrong token type type=%r (expected access)",
            payload.get("type"),
        )
        return None
    jti = payload.get("jti")
    if jti:
        redis = await get_redis()
        if await redis.get(f"{BLACKLIST_JTI_PREFIX}{jti}"):
            logger.debug("decode_ws_identity: jti revoked/blacklisted jti_prefix=%s", jti[:12])
            return None

    sub_type = payload.get("sub_type", "user")
    grant_id: UUID | None = None
    eff_tenant_id: UUID | None = None
    if sub_type == "impersonation":
        if payload.get("grant_id"):
            try:
                grant_id = UUID(payload["grant_id"])
            except ValueError:
                grant_id = None
        if payload.get("impersonated_tenant_id"):
            try:
                eff_tenant_id = UUID(payload["impersonated_tenant_id"])
            except ValueError:
                eff_tenant_id = None
    elif payload.get("tenant_id"):
        try:
            eff_tenant_id = UUID(payload["tenant_id"])
        except ValueError:
            eff_tenant_id = None

    return CurrentIdentity(
        id=UUID(payload["sub"]),
        sub_type=sub_type,
        is_super_admin=payload.get("is_super_admin", False),
        tenant_id=eff_tenant_id,
        role=payload.get("role"),
        grant_id=grant_id,
        global_account=payload.get("global_account"),
        global_permissions=payload.get("global_permissions", []),
    )


async def ws_principal_allowed_for_tenant(
    identity: CurrentIdentity,
    tenant_id: UUID,
    child_student_id: UUID | None = None,
) -> bool:
    """Whether this principal may open a tenant-scoped WebSocket for ``tenant_id``.

    Matches HTTP behavior: ``X-Tenant-ID`` may differ from the JWT default when the
    user has an active membership in the requested tenant (e.g. parent / multi-tenant).

    When ``child_student_id`` is set (same idea as ``X-Child-Context``), guardians who
    have no ``Membership`` row in the workspace but may act for that learner are allowed.
    """
    if identity.is_super_admin:
        return True
    if identity.tenant_id == tenant_id:
        return True
    async with async_session_factory() as db:
        repo = AuthRepository(db)
        if identity.sub_type == "student":
            row = await repo.get_student_membership(identity.id, tenant_id)
            return row is not None
        if identity.sub_type == "user":
            row = await repo.get_active_membership(identity.id, tenant_id)
            if row is not None:
                return True
            if child_student_id is not None:
                return await guardian_may_use_child_context_in_tenant(
                    db,
                    identity=identity,
                    student_id=child_student_id,
                    tenant_id=tenant_id,
                )
            return False
    return False

