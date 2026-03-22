"""User-scoped Redis channels for dashboard / tenant realtime signals."""

from __future__ import annotations

from uuid import UUID

from app.realtime.gateway import publish_channel_message


def user_realtime_channel(tenant_id: UUID, principal_id: UUID) -> str:
    """Principal id matches JWT `sub` (user or student)."""
    return f"tenant:{tenant_id}:user:{principal_id}"


async def publish_user_channel_event(
    tenant_id: UUID,
    principal_id: UUID,
    *,
    event_type: str,
    payload: dict | None = None,
) -> None:
    """Publish a small envelope; clients refetch REST rather than relying on payload size."""
    channel = user_realtime_channel(tenant_id, principal_id)
    body: dict = {
        "type": "event",
        "data": {
            "event_type": event_type,
            "payload": payload or {},
        },
    }
    await publish_channel_message(channel, body)


async def publish_notifications_changed(tenant_id: UUID, user_id: UUID) -> None:
    """Signal clients to refetch `/notifications` (tiny payload)."""
    await publish_user_channel_event(
        tenant_id,
        user_id,
        event_type="notifications.changed",
        payload={},
    )


async def publish_messages_changed(
    tenant_id: UUID,
    user_id: UUID,
    *,
    conversation_id: UUID | None = None,
) -> None:
    """Signal clients to refetch conversations / message lists."""
    pl: dict = {}
    if conversation_id is not None:
        pl["conversation_id"] = str(conversation_id)
    await publish_user_channel_event(
        tenant_id,
        user_id,
        event_type="messages.changed",
        payload=pl,
    )


async def publish_sessions_changed(
    tenant_id: UUID,
    recipient_principal_ids: list[UUID],
    *,
    classroom_id: UUID,
    session_id: UUID | None = None,
    reason: str = "sessions.changed",
) -> None:
    """Notify each recipient on their user channel (deduped)."""
    seen: set[UUID] = set()
    pl: dict = {"classroom_id": str(classroom_id), "reason": reason}
    if session_id is not None:
        pl["session_id"] = str(session_id)
    for pid in recipient_principal_ids:
        if pid in seen:
            continue
        seen.add(pid)
        await publish_user_channel_event(
            tenant_id,
            pid,
            event_type="sessions.changed",
            payload=pl,
        )
