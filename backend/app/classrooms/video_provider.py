"""LiveKit provider abstraction (cloud first, self-host compatible)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import jwt

from app.config import settings


@dataclass(frozen=True)
class VideoProviderConfig:
    provider: str
    ws_url: str
    api_key: str
    api_secret: str
    token_ttl_seconds: int

    @property
    def enabled(self) -> bool:
        return bool(self.ws_url and self.api_key and self.api_secret)


@dataclass(frozen=True)
class VideoTokenResult:
    provider: str
    room_name: str
    participant_name: str
    participant_identity: str
    ws_url: str
    token: str
    expires_at: datetime


def resolve_video_provider_config() -> VideoProviderConfig:
    mode = (settings.LIVEKIT_PROVIDER_MODE or "livekit_cloud").strip().lower()
    if mode not in {"livekit_cloud", "livekit_self_host"}:
        mode = "livekit_cloud"
    return VideoProviderConfig(
        provider=mode,
        ws_url=(settings.LIVEKIT_WS_URL or "").strip(),
        api_key=(settings.LIVEKIT_API_KEY or "").strip(),
        api_secret=(settings.LIVEKIT_API_SECRET or "").strip(),
        token_ttl_seconds=max(60, int(settings.LIVEKIT_TOKEN_TTL_SECONDS or 3600)),
    )


def livekit_room_name(*, tenant_id: UUID, classroom_id: UUID, session_id: UUID) -> str:
    return f"tenant-{tenant_id}:class-{classroom_id}:session-{session_id}"


def build_livekit_access_token(
    *,
    config: VideoProviderConfig,
    tenant_id: UUID,
    classroom_id: UUID,
    session_id: UUID,
    participant_identity: str,
    participant_name: str,
    can_publish: bool = True,
    can_subscribe: bool = True,
) -> VideoTokenResult:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=config.token_ttl_seconds)
    room = livekit_room_name(
        tenant_id=tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
    )
    payload = {
        "iss": config.api_key,
        "sub": participant_identity,
        "nbf": int(now.timestamp()) - 5,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "name": participant_name,
        "metadata": f'{{"tenant_id":"{tenant_id}","classroom_id":"{classroom_id}","session_id":"{session_id}"}}',
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": bool(can_publish),
            "canSubscribe": bool(can_subscribe),
            "canPublishData": True,
        },
    }
    token = jwt.encode(payload, config.api_secret, algorithm="HS256")
    return VideoTokenResult(
        provider=config.provider,
        room_name=room,
        participant_name=participant_name,
        participant_identity=participant_identity,
        ws_url=config.ws_url,
        token=token,
        expires_at=exp,
    )
