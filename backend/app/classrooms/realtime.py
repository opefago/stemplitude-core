"""Classroom-specific realtime websocket logic.

Transport/runtime primitives are centralized in app.realtime.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Awaitable, Callable
from uuid import UUID

from fastapi import WebSocket, status

from app.classrooms.repository import ClassroomRepository
from app.classrooms.schemas import (
    SessionActivityCreateRequest,
    SessionChatCreateRequest,
    SessionPresenceHeartbeatRequest,
)
from app.classrooms.service import ClassroomService
from app.database import async_session_factory
from app.dependencies import CurrentIdentity
from app.realtime.auth import decode_ws_identity, get_ws_tenant, get_ws_token
from app.realtime.gateway import (
    CommandDispatchResult,
    GatewaySettings,
    acquire_idempotency_key,
    publish_channel_message,
    run_redis_websocket_gateway,
)
from app.students.repository import StudentRepository
from app.tenants.models import Membership

logger = logging.getLogger(__name__)

REPLAY_LIMIT = 1000
IDEMPOTENCY_TTL_SECONDS = 60 * 10

METRICS = {
    "connections_opened": 0,
    "connections_closed": 0,
    "events_published": 0,
    "replay_requests": 0,
    "messages_dropped_rate_limit": 0,
}


@dataclass(frozen=True)
class RealtimeConnectionContext:
    classroom_id: UUID
    session_id: UUID
    tenant_id: UUID
    channel: str


CommandHandler = Callable[
    [ClassroomService, dict, CurrentIdentity, str | None, RealtimeConnectionContext],
    Awaitable[CommandDispatchResult],
]


async def _build_presence_payload(
    *,
    classroom_id: UUID,
    session_id: UUID,
    tenant_id: UUID,
) -> dict:
    async with async_session_factory() as db:
        service = ClassroomService(db)
        summary = await service.get_session_presence_summary(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        participants = await service.get_session_presence_participants(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        await db.commit()
        return {
            "summary": summary.model_dump(mode="json"),
            "participants": [p.model_dump(mode="json") for p in participants],
        }


async def _emit_presence_updated(
    *,
    channel: str,
    classroom_id: UUID,
    session_id: UUID,
    tenant_id: UUID,
) -> None:
    payload = await _build_presence_payload(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant_id,
    )
    await publish_channel_message(
        channel,
        {"type": "event", "data": {"event_type": "presence.updated", "payload": payload}},
    )
    METRICS["events_published"] += 1


async def _authorize_ws_access(
    *,
    identity: CurrentIdentity,
    classroom_id: UUID,
    tenant_id: UUID,
) -> bool:
    async with async_session_factory() as db:
        if identity.sub_type == "student":
            repo = StudentRepository(db)
            enrollment = await repo.get_membership(identity.id, tenant_id)
            if not enrollment:
                return False
            from app.classrooms.repository import ClassroomRepository

            classroom_repo = ClassroomRepository(db)
            row = await classroom_repo.get_enrollment(classroom_id, identity.id)
            return row is not None

        membership = await db.execute(
            Membership.__table__.select().where(
                Membership.user_id == identity.id,
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
            )
        )
        return membership.first() is not None


class ClassroomRealtimeCommandRouter:
    """Dispatch classroom websocket commands to domain handlers.

    This keeps websocket transport/lifecycle generic while classroom features
    evolve by registering additional command handlers.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, CommandHandler] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        self._handlers["presence.leave"] = self._handle_presence_leave
        self._handlers["presence.in_lab"] = self._handle_presence_in_lab
        self._handlers["chat.send"] = self._handle_chat_send
        self._handlers["recognition.award"] = self._handle_recognition_award
        self._handlers["lab.select"] = self._handle_lab_select
        self._handlers["assignment.upsert"] = self._handle_assignment_upsert
        self._handlers["assignment.delete"] = self._handle_assignment_delete

    async def execute(
        self,
        *,
        service: ClassroomService,
        msg_type: str,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        handler = self._handlers.get(msg_type)
        if handler:
            return await handler(service, msg, identity, correlation_id, context)
        return await self._handle_generic(service, msg_type, msg, identity, correlation_id, context)

    async def _handle_presence_leave(
        self,
        service: ClassroomService,
        _: dict,
        identity: CurrentIdentity,
        __: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        await service.heartbeat_session_presence(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            data=SessionPresenceHeartbeatRequest(status="left"),
        )
        return CommandDispatchResult(envelope=None, emit_presence=True)

    async def _handle_presence_in_lab(
        self,
        service: ClassroomService,
        _: dict,
        identity: CurrentIdentity,
        __: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        """Mark actor as transitioning to a lab — remains a session participant."""
        await service.heartbeat_session_presence(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            data=SessionPresenceHeartbeatRequest(status="in_lab"),
        )
        return CommandDispatchResult(envelope=None, emit_presence=True)

    async def _handle_chat_send(
        self,
        service: ClassroomService,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        data = SessionChatCreateRequest(message=str(msg.get("message") or ""))
        event = await service.create_session_chat_event(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            data=data,
            correlation_id=correlation_id,
        )
        replay = await service.replay_session_events(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            after_sequence=event.sequence - 1,
            limit=1,
        )
        return CommandDispatchResult(envelope=(replay[0] if replay else None))

    async def _handle_recognition_award(
        self,
        service: ClassroomService,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        data = SessionActivityCreateRequest(
            activity_type=str(msg.get("activity_type") or ""),
            student_id=UUID(str(msg.get("student_id"))),
            message=(str(msg.get("message")) if msg.get("message") is not None else None),
            points_delta=(int(msg.get("points_delta")) if msg.get("points_delta") is not None else None),
        )
        event = await service.create_session_activity_event(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            data=data,
            correlation_id=correlation_id,
        )
        replay = await service.replay_session_events(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            after_sequence=event.sequence - 1,
            limit=1,
        )
        return CommandDispatchResult(envelope=(replay[0] if replay else None))

    async def _handle_lab_select(
        self,
        service: ClassroomService,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        envelope = await service.set_session_active_lab(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            active_lab=(str(msg.get("active_lab") or "") or None),
            correlation_id=correlation_id,
        )
        return CommandDispatchResult(envelope=envelope)

    async def _handle_assignment_upsert(
        self,
        service: ClassroomService,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        assignment_payload = msg.get("assignment") or {}
        if not isinstance(assignment_payload, dict):
            raise ValueError("assignment must be object")
        envelope = await service.upsert_session_assignment(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            assignment=assignment_payload,
            correlation_id=correlation_id,
        )
        return CommandDispatchResult(envelope=envelope)

    async def _handle_assignment_delete(
        self,
        service: ClassroomService,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        assignment_id = str(msg.get("assignment_id") or "")
        if not assignment_id:
            raise ValueError("assignment_id required")
        envelope = await service.delete_session_assignment(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            assignment_id=assignment_id,
            correlation_id=correlation_id,
        )
        return CommandDispatchResult(envelope=envelope)

    async def _handle_generic(
        self,
        service: ClassroomService,
        msg_type: str,
        msg: dict,
        identity: CurrentIdentity,
        correlation_id: str | None,
        context: RealtimeConnectionContext,
    ) -> CommandDispatchResult:
        payload = msg.get("payload")
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("payload must be object")
        envelope = await service.publish_generic_session_event(
            classroom_id=context.classroom_id,
            session_id=context.session_id,
            tenant_id=context.tenant_id,
            identity=identity,
            event_type=msg_type or "session.generic",
            payload=payload or {},
            correlation_id=correlation_id,
        )
        return CommandDispatchResult(envelope=envelope)


async def classroom_session_ws_handler(
    websocket: WebSocket,
    *,
    classroom_id: UUID,
    session_id: UUID,
) -> None:
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

    is_authorized = await _authorize_ws_access(
        identity=identity,
        classroom_id=classroom_id,
        tenant_id=tenant_id,
    )
    if not is_authorized and not identity.is_super_admin:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Access denied")
        return

    channel = f"classroom:session:{session_id}"
    context = RealtimeConnectionContext(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant_id,
        channel=channel,
    )
    command_router = ClassroomRealtimeCommandRouter()

    async def bootstrap(after_sequence: int) -> dict:
        async with async_session_factory() as db:
            service = ClassroomService(db)
            snapshot = await service.get_realtime_snapshot(
                classroom_id=classroom_id,
                session_id=session_id,
                tenant_id=tenant_id,
                after_sequence=max(0, after_sequence),
                replay_limit=REPLAY_LIMIT,
            )
            await service.heartbeat_session_presence(
                classroom_id=classroom_id,
                session_id=session_id,
                tenant_id=tenant_id,
                identity=identity,
                data=SessionPresenceHeartbeatRequest(status="active"),
            )
            await db.commit()
            return snapshot.model_dump(mode="json")

    async def emit_presence_update() -> None:
        await _emit_presence_updated(
            channel=channel,
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )

    async def handle_heartbeat() -> None:
        async with async_session_factory() as db:
            service = ClassroomService(db)
            await service.heartbeat_session_presence(
                classroom_id=classroom_id,
                session_id=session_id,
                tenant_id=tenant_id,
                identity=identity,
                data=SessionPresenceHeartbeatRequest(status="active"),
            )
            await db.commit()

    async def handle_replay(after_sequence: int, limit: int) -> list[dict]:
        async with async_session_factory() as db:
            service = ClassroomService(db)
            events = await service.replay_session_events(
                classroom_id=classroom_id,
                session_id=session_id,
                tenant_id=tenant_id,
                after_sequence=after_sequence,
                limit=limit,
            )
            await db.commit()
            return [e.model_dump(mode="json") for e in events]

    async def handle_command(
        msg_type: str,
        msg: dict,
        correlation_id: str | None,
    ) -> CommandDispatchResult:
        async with async_session_factory() as db:
            service = ClassroomService(db)
            result = await command_router.execute(
                service=service,
                msg_type=msg_type,
                msg=msg,
                identity=identity,
                correlation_id=correlation_id,
                context=context,
            )
            await db.commit()
            return result

    async def check_idempotency(correlation_id: str | None) -> bool:
        if not correlation_id:
            return True
        key = f"realtime:idempotency:{session_id}:{identity.id}:{correlation_id}"
        return await acquire_idempotency_key(
            key=key,
            ttl_seconds=IDEMPOTENCY_TTL_SECONDS,
        )

    async def handle_disconnect() -> None:
        actor_type = ClassroomService._presence_actor_type(identity)
        async with async_session_factory() as db:
            repo = ClassroomRepository(db)
            in_lab = await repo.get_presence_in_lab(
                session_id=session_id,
                actor_id=identity.id,
                actor_type=actor_type,
            )
            if not in_lab:
                service = ClassroomService(db)
                await service.heartbeat_session_presence(
                    classroom_id=classroom_id,
                    session_id=session_id,
                    tenant_id=tenant_id,
                    identity=identity,
                    data=SessionPresenceHeartbeatRequest(status="left"),
                )
            await db.commit()
        await emit_presence_update()

    await run_redis_websocket_gateway(
        websocket=websocket,
        channel=channel,
        logger=logger,
        metrics=METRICS,
        settings=GatewaySettings(replay_limit=REPLAY_LIMIT),
        connection_log_fields=f"session={session_id} actor={identity.id} tenant={tenant_id}",
        bootstrap=bootstrap,
        handle_heartbeat=handle_heartbeat,
        handle_replay=handle_replay,
        handle_command=handle_command,
        handle_disconnect=handle_disconnect,
        check_idempotency=check_idempotency,
        emit_presence_update=emit_presence_update,
    )

    logger.info(
        "Classroom realtime summary session=%s actor=%s tenant=%s published=%s dropped=%s replay=%s",
        session_id,
        identity.id,
        tenant_id,
        METRICS["events_published"],
        METRICS["messages_dropped_rate_limit"],
        METRICS["replay_requests"],
    )
