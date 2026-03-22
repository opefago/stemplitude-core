from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from fastapi import WebSocket, WebSocketDisconnect, status

from app.core.redis import get_redis


def ws_json(payload: dict) -> str:
    return json.dumps(payload, default=str)


def _to_jsonable(payload: Any) -> Any:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(mode="json")
    return payload


class SlidingWindowRateLimiter:
    def __init__(self, *, limit: int, window_seconds: int):
        self.limit = limit
        self.window = timedelta(seconds=window_seconds)
        self.events: list[datetime] = []

    def allow(self) -> bool:
        now = datetime.now(timezone.utc)
        cutoff = now - self.window
        self.events = [t for t in self.events if t >= cutoff]
        if len(self.events) >= self.limit:
            return False
        self.events.append(now)
        return True


async def publish_channel_message(channel: str, message: dict) -> None:
    redis = await get_redis()
    await redis.publish(channel, ws_json(message))


async def acquire_idempotency_key(*, key: str, ttl_seconds: int) -> bool:
    redis = await get_redis()
    return bool(await redis.set(key, "1", ex=ttl_seconds, nx=True))


@dataclass(frozen=True)
class GatewaySettings:
    heartbeat_timeout: timedelta = timedelta(seconds=45)
    server_ping_interval_seconds: int = 20
    max_message_bytes: int = 64 * 1024
    max_messages_per_minute: int = 120
    replay_limit: int = 1000


@dataclass
class CommandDispatchResult:
    envelope: Any | None = None
    emit_presence: bool = False


BootstrapCallback = Callable[[int], Awaitable[dict]]
HeartbeatCallback = Callable[[], Awaitable[None]]
ReplayCallback = Callable[[int, int], Awaitable[list[dict]]]
CommandCallback = Callable[[str, dict, str | None], Awaitable[CommandDispatchResult]]
DisconnectCallback = Callable[[], Awaitable[None]]
IdempotencyCallback = Callable[[str | None], Awaitable[bool]]
PresenceEmitCallback = Callable[[], Awaitable[None]]


async def run_redis_websocket_gateway(
    *,
    websocket: WebSocket,
    channel: str,
    logger,
    metrics: dict[str, int],
    settings: GatewaySettings,
    connection_log_fields: str,
    bootstrap: BootstrapCallback,
    handle_heartbeat: HeartbeatCallback,
    handle_replay: ReplayCallback,
    handle_command: CommandCallback,
    handle_disconnect: DisconnectCallback,
    check_idempotency: IdempotencyCallback | None = None,
    emit_presence_update: PresenceEmitCallback | None = None,
) -> None:
    await websocket.accept()
    metrics["connections_opened"] += 1
    logger.info(
        "Realtime websocket connected %s open=%s",
        connection_log_fields,
        metrics["connections_opened"] - metrics["connections_closed"],
    )

    limiter = SlidingWindowRateLimiter(
        limit=settings.max_messages_per_minute,
        window_seconds=60,
    )
    last_heartbeat_at = datetime.now(timezone.utc)
    stop_event = asyncio.Event()
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    async def redis_forwarder() -> None:
        try:
            async for message in pubsub.listen():
                if stop_event.is_set():
                    return
                if message.get("type") != "message":
                    continue
                data = message.get("data")
                if not isinstance(data, str):
                    continue
                await websocket.send_text(data)
        except Exception:
            logger.exception("Realtime redis forwarder failed %s", connection_log_fields)

    async def ping_loop() -> None:
        nonlocal last_heartbeat_at
        try:
            while not stop_event.is_set():
                await asyncio.sleep(settings.server_ping_interval_seconds)
                await websocket.send_text(
                    ws_json({"type": "ping", "ts": datetime.now(timezone.utc).isoformat()})
                )
                if datetime.now(timezone.utc) - last_heartbeat_at > settings.heartbeat_timeout:
                    await websocket.close(code=status.WS_1001_GOING_AWAY, reason="Heartbeat timeout")
                    return
        except Exception:
            return

    forward_task = asyncio.create_task(redis_forwarder())
    ping_task = asyncio.create_task(ping_loop())

    try:
        after_sequence = int(websocket.query_params.get("last_sequence", "0") or 0)
        snapshot_payload = await bootstrap(max(0, after_sequence))
        await websocket.send_text(ws_json({"type": "snapshot", "data": snapshot_payload}))
        if emit_presence_update is not None:
            await emit_presence_update()

        while True:
            raw = await websocket.receive_text()
            if len(raw.encode("utf-8")) > settings.max_message_bytes:
                await websocket.send_text(ws_json({"type": "error", "error": "Message too large"}))
                continue
            if not limiter.allow():
                metrics["messages_dropped_rate_limit"] += 1
                await websocket.send_text(ws_json({"type": "error", "error": "Rate limit exceeded"}))
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(ws_json({"type": "error", "error": "Invalid JSON payload"}))
                continue

            msg_type = str(msg.get("type") or "").strip()
            correlation_id = msg.get("correlation_id")

            if msg_type not in {"ping", "pong", "presence.heartbeat", "replay.request"} and check_idempotency:
                is_first = await check_idempotency(correlation_id if isinstance(correlation_id, str) else None)
                if not is_first:
                    await websocket.send_text(
                        ws_json(
                            {
                                "type": "ack",
                                "data": {
                                    "status": "duplicate_ignored",
                                    "correlation_id": correlation_id,
                                },
                            }
                        )
                    )
                    continue

            if msg_type in {"pong", "ping", "presence.heartbeat"}:
                last_heartbeat_at = datetime.now(timezone.utc)
                await handle_heartbeat()
                await websocket.send_text(ws_json({"type": "pong"}))
                if emit_presence_update is not None:
                    await emit_presence_update()
                continue

            if msg_type == "replay.request":
                metrics["replay_requests"] += 1
                after = int(msg.get("after_sequence") or 0)
                events = await handle_replay(max(0, after), settings.replay_limit)
                await websocket.send_text(ws_json({"type": "replay", "data": events}))
                continue

            try:
                result = await handle_command(
                    msg_type,
                    msg,
                    correlation_id if isinstance(correlation_id, str) else None,
                )
                if result.envelope is not None:
                    envelope_payload = _to_jsonable(result.envelope)
                    await publish_channel_message(
                        channel,
                        {"type": "event", "data": envelope_payload},
                    )
                    metrics["events_published"] = metrics.get("events_published", 0) + 1
                    sequence = envelope_payload.get("sequence") if isinstance(envelope_payload, dict) else None
                    event_id = envelope_payload.get("event_id") if isinstance(envelope_payload, dict) else None
                    await websocket.send_text(
                        ws_json(
                            {
                                "type": "ack",
                                "data": {
                                    "status": "ok",
                                    "correlation_id": correlation_id,
                                    "event_id": event_id,
                                    "sequence": sequence,
                                },
                            }
                        )
                    )
                if emit_presence_update is not None and (
                    result.emit_presence or msg_type.startswith("presence.") or msg_type == "presence.heartbeat"
                ):
                    await emit_presence_update()
            except Exception as exc:
                details = exc.errors() if hasattr(exc, "errors") else None
                await websocket.send_text(
                    ws_json(
                        {
                            "type": "error",
                            "error": str(exc),
                            "details": details,
                        }
                    )
                )
                logger.exception("Realtime command failed %s type=%s", connection_log_fields, msg_type)
    except WebSocketDisconnect:
        pass
    finally:
        metrics["connections_closed"] += 1
        stop_event.set()
        forward_task.cancel()
        ping_task.cancel()
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
        except Exception:
            pass
        try:
            await handle_disconnect()
        except Exception:
            logger.debug("Realtime disconnect cleanup failed", exc_info=True)
        logger.info(
            "Realtime websocket disconnected %s active=%s dropped=%s replay=%s",
            connection_log_fields,
            metrics["connections_opened"] - metrics["connections_closed"],
            metrics["messages_dropped_rate_limit"],
            metrics["replay_requests"],
        )

