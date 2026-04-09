"""Yjs WebSocket sync endpoint for real-time collaborative lab viewing.

Room ID formats
---------------
Solo   (1 writer + N observers):  ``lab:solo:{actorId}:{sessionId}``
Group  (N writers):               ``lab:group:{groupId}:{sessionId}``
Board  (session-wide whiteboard): ``board:{sessionId}``
Legacy (backward compat):         ``lab:{actorId}:{sessionId}``

Auth
----
Writer (read_only=0): actor must own the solo room, or be enrolled in the
    classroom session owning a group room.
Observer (read_only=1): any enrolled student or active tenant member for the
    classroom that owns the session; super admins always allowed.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pycrdt import Channel
from pycrdt.websocket import WebsocketServer

from app.classrooms.repository import ClassroomRepository
from app.database import async_session_factory
from app.realtime.auth import decode_ws_identity, get_ws_tenant, get_ws_token
from app.students.repository import StudentRepository
from app.tenants.models import Membership

logger = logging.getLogger(__name__)

router = APIRouter()

# Module-level server — started/stopped in the app lifespan.
yjs_server = WebsocketServer(auto_clean_rooms=True)
_server_started = False


async def _ensure_server_started() -> None:
    """Start the Yjs WebSocket server if not already running.

    The lifespan handler in main.py uses ``async with yjs_server:`` which
    is the canonical way.  However uvicorn --reload can lose the lifespan
    context on hot-reloads, leaving the server in a stopped state.  This
    fallback ensures the endpoint still works during development.
    """
    global _server_started
    if _server_started:
        return
    try:
        await yjs_server.start()
        _server_started = True
        logger.info("Yjs WebsocketServer started (fallback)")
    except RuntimeError:
        pass


# ─── Room ID parsing ──────────────────────────────────────────────────────────

class RoomKind(str, Enum):
    SOLO = "solo"
    GROUP = "group"
    BOARD = "board"


@dataclass
class ParsedRoom:
    kind: RoomKind
    session_id: UUID
    # solo: the student who owns the room
    actor_id: UUID | None = None
    # group: the group identifier (any UUID used as a group key)
    group_id: UUID | None = None


def _parse_room_name(room_name: str) -> ParsedRoom | None:
    """Parse the room_name string into a structured ParsedRoom.

    Accepts:
      lab:solo:{actorId}:{sessionId}     (canonical solo)
      lab:group:{groupId}:{sessionId}    (group room)
      board:{sessionId}                  (session-wide whiteboard)
      lab:{actorId}:{sessionId}          (legacy / backward compat → treated as solo)
    """
    parts = room_name.split(":")

    try:
        if len(parts) == 4 and parts[0] == "lab" and parts[1] == "solo":
            return ParsedRoom(
                kind=RoomKind.SOLO,
                actor_id=UUID(parts[2]),
                session_id=UUID(parts[3]),
            )

        if len(parts) == 4 and parts[0] == "lab" and parts[1] == "group":
            return ParsedRoom(
                kind=RoomKind.GROUP,
                group_id=UUID(parts[2]),
                session_id=UUID(parts[3]),
            )

        if len(parts) == 2 and parts[0] == "board":
            return ParsedRoom(
                kind=RoomKind.BOARD,
                session_id=UUID(parts[1]),
            )

        # Legacy: lab:{actorId}:{sessionId}
        if len(parts) == 3 and parts[0] == "lab":
            return ParsedRoom(
                kind=RoomKind.SOLO,
                actor_id=UUID(parts[1]),
                session_id=UUID(parts[2]),
            )
    except ValueError:
        return None

    return None


# ─── WebSocket channel adapter ────────────────────────────────────────────────

class _StarletteWsChannel(Channel):
    """Wrap a Starlette/FastAPI WebSocket as a pycrdt Channel."""

    def __init__(self, websocket: WebSocket, room_name: str) -> None:
        self._ws = websocket
        self._path = room_name

    @property
    def path(self) -> str:
        return self._path

    async def send(self, message: bytes) -> None:
        await self._ws.send_bytes(message)

    async def recv(self) -> bytes:
        data = await self._ws.receive_bytes()
        return bytes(data)

    async def __anext__(self) -> bytes:
        try:
            return await self.recv()
        except (WebSocketDisconnect, Exception):
            raise StopAsyncIteration


# ─── Authorization ────────────────────────────────────────────────────────────

async def _authorize_yjs_access(
    *,
    identity: "CurrentIdentity",  # noqa: F821
    parsed: ParsedRoom,
    tenant_id: UUID,
    read_only: bool,
) -> bool:
    """Return True if the identity is allowed to join this Yjs room."""

    # Super admins may observe any room.
    if getattr(identity, "is_super_admin", False):
        return True

    if not read_only and parsed.kind == RoomKind.SOLO:
        # Solo writer: only the room's owner may write.
        if identity.id == parsed.actor_id:
            return True
        # Guardian in learner mode: allow parent to write to their child's room.
        if identity.sub_type == "user" and parsed.actor_id is not None:
            role = (getattr(identity, "role", "") or "").strip().lower()
            if role in ("parent", "homeschool_parent"):
                from app.students.parent_access import guardian_may_use_child_context_in_tenant
                async with async_session_factory() as db:
                    return await guardian_may_use_child_context_in_tenant(
                        db,
                        identity=identity,
                        student_id=parsed.actor_id,
                        tenant_id=tenant_id,
                    )
        return False

    # Board and group rooms: any session participant may read/write.
    # Observers: verify classroom membership.
    from app.classrooms.models import ClassroomSession  # local import avoids circulars
    from sqlalchemy import select as sa_select

    async with async_session_factory() as db:
        result = await db.execute(
            sa_select(ClassroomSession.classroom_id).where(
                ClassroomSession.id == parsed.session_id
            )
        )
        row = result.first()
        if not row:
            return False
        classroom_id: UUID = row[0]

        repo = ClassroomRepository(db)

        if identity.sub_type == "student":
            student_repo = StudentRepository(db)
            membership = await student_repo.get_membership(identity.id, tenant_id)
            if not membership:
                return False
            enrollment = await repo.get_enrollment(classroom_id, identity.id)
            return enrollment is not None

        # Instructor / admin user: active tenant membership is sufficient.
        mem_result = await db.execute(
            Membership.__table__.select().where(
                Membership.user_id == identity.id,
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,  # noqa: E712
            )
        )
        return mem_result.first() is not None


# ─── Persistence hooks ────────────────────────────────────────────────────────

async def _attach_persistence(room_name: str) -> None:
    """Load persisted state into the room and register a save-on-update observer."""
    from app.labs.yjs_persistence import load_room_state, schedule_save  # local import

    await _ensure_server_started()
    room = await yjs_server.get_room(room_name)
    ydoc = room.ydoc

    # Restore previously persisted state (no-op for new rooms).
    state = await load_room_state(room_name)
    if state:
        try:
            ydoc.apply_update(state)
            logger.debug("Yjs room %s: restored %d bytes from storage", room_name, len(state))
        except Exception:
            logger.warning("Yjs room %s: failed to restore state", room_name, exc_info=True)

    # Save whenever the document is updated (debounced).
    def _on_update(_event: object) -> None:
        asyncio.create_task(schedule_save(room_name, ydoc))

    ydoc.observe(_on_update)


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@router.websocket("/sync/{room_name}")
async def lab_yjs_sync(
    websocket: WebSocket,
    room_name: str,
) -> None:
    """WebSocket endpoint for Yjs document sync.

    Query params
    ------------
    token       JWT access token
    tenant_id   Tenant identifier
    read_only   ``1`` = observer / ``0`` = writer (default)
    """
    token = get_ws_token(websocket)
    tenant_id_str = get_ws_tenant(websocket)
    read_only = websocket.query_params.get("read_only", "0") == "1"

    if not token or not tenant_id_str:
        await websocket.close(code=4001)
        return

    identity = await decode_ws_identity(token)
    if not identity:
        await websocket.close(code=4001)
        return

    try:
        tenant_id = UUID(tenant_id_str)
    except ValueError:
        await websocket.close(code=4003)
        return

    parsed = _parse_room_name(room_name)
    if parsed is None:
        await websocket.close(code=4003)
        return

    allowed = await _authorize_yjs_access(
        identity=identity,
        parsed=parsed,
        tenant_id=tenant_id,
        read_only=read_only,
    )
    if not allowed:
        await websocket.close(code=4003)
        return

    await websocket.accept()

    # Restore persisted state and register save hook (idempotent per room).
    await _ensure_server_started()
    await _attach_persistence(room_name)

    channel = _StarletteWsChannel(websocket, room_name)

    try:
        await yjs_server.serve(channel)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug(
            "Yjs sync error room=%s identity=%s", room_name, identity.id, exc_info=True
        )
