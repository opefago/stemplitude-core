"""Authenticated tenant user WebSocket for dashboard-scale realtime signals."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, status

from app.auth.repository import AuthRepository
from app.database import async_session_factory
from app.realtime.auth import decode_ws_identity, get_ws_tenant, get_ws_token
from app.realtime.gateway import CommandDispatchResult, GatewaySettings, run_redis_websocket_gateway
from app.realtime.user_events import user_realtime_channel

logger = logging.getLogger(__name__)

METRICS = {
    "connections_opened": 0,
    "connections_closed": 0,
    "replay_requests": 0,
    "messages_dropped_rate_limit": 0,
}

router = APIRouter()


@router.websocket("/ws")
async def tenant_user_realtime_ws(websocket: WebSocket) -> None:
    token = get_ws_token(websocket)
    tenant_raw = get_ws_tenant(websocket)
    if not token or not tenant_raw:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth context")
        return

    try:
        tenant_id = UUID(tenant_raw)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid tenant")
        return

    identity = await decode_ws_identity(token)
    if not identity:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    if identity.tenant_id and identity.tenant_id != tenant_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Tenant mismatch")
        return

    if not identity.tenant_id and not identity.is_super_admin:
        is_member = False
        async with async_session_factory() as db:
            repo = AuthRepository(db)
            if identity.sub_type == "student":
                membership = await repo.get_student_membership(identity.id, tenant_id)
                is_member = membership is not None
            elif identity.sub_type == "user":
                membership = await repo.get_active_membership(identity.id, tenant_id)
                is_member = membership is not None
        if not is_member:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing tenant")
            return

    channel = user_realtime_channel(tenant_id, identity.id)

    async def bootstrap(_after_sequence: int) -> dict:
        return {"latest_sequence": 0, "events": []}

    async def handle_heartbeat() -> None:
        return None

    async def handle_replay(_after_sequence: int, _limit: int) -> list[dict]:
        return []

    async def handle_command(
        msg_type: str,
        _msg: dict,
        _correlation_id: str | None,
    ) -> CommandDispatchResult:
        raise ValueError(f"Unsupported realtime command: {msg_type or '(empty)'}")

    async def handle_disconnect() -> None:
        return None

    await run_redis_websocket_gateway(
        websocket=websocket,
        channel=channel,
        logger=logger,
        metrics=METRICS,
        settings=GatewaySettings(replay_limit=0),
        connection_log_fields=f"user_rt actor={identity.id} tenant={tenant_id}",
        bootstrap=bootstrap,
        handle_heartbeat=handle_heartbeat,
        handle_replay=handle_replay,
        handle_command=handle_command,
        handle_disconnect=handle_disconnect,
        check_idempotency=None,
        emit_presence_update=None,
    )
