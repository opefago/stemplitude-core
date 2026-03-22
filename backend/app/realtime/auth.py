from __future__ import annotations

from uuid import UUID

from fastapi import WebSocket

from app.core.redis import get_redis
from app.core.security import decode_token
from app.dependencies import BLACKLIST_JTI_PREFIX, CurrentIdentity


def get_ws_token(websocket: WebSocket) -> str | None:
    auth_header = websocket.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return websocket.query_params.get("token")


def get_ws_tenant(websocket: WebSocket) -> str | None:
    return websocket.headers.get("x-tenant-id") or websocket.query_params.get("tenant_id")


async def decode_ws_identity(token: str) -> CurrentIdentity | None:
    payload = decode_token(token)
    if not payload or not payload.get("sub") or payload.get("type") != "access":
        return None
    jti = payload.get("jti")
    if jti:
        redis = await get_redis()
        if await redis.get(f"{BLACKLIST_JTI_PREFIX}{jti}"):
            return None
    return CurrentIdentity(
        id=UUID(payload["sub"]),
        sub_type=payload.get("sub_type", "user"),
        is_super_admin=payload.get("is_super_admin", False),
        tenant_id=UUID(payload["tenant_id"]) if payload.get("tenant_id") else None,
        role=payload.get("role"),
        global_account=payload.get("global_account"),
        global_permissions=payload.get("global_permissions", []),
    )

