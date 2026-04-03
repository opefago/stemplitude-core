from uuid import uuid4

from app.classrooms.video_provider import build_livekit_access_token, livekit_room_name, resolve_video_provider_config


def test_livekit_room_name_contains_scope_ids():
    tenant_id = uuid4()
    classroom_id = uuid4()
    session_id = uuid4()
    room = livekit_room_name(tenant_id=tenant_id, classroom_id=classroom_id, session_id=session_id)
    assert str(tenant_id) in room
    assert str(classroom_id) in room
    assert str(session_id) in room


def test_build_livekit_access_token_generates_jwt():
    cfg = resolve_video_provider_config()
    cfg = type(cfg)(
        provider="livekit_cloud",
        ws_url="wss://example.livekit.cloud",
        api_key="key",
        api_secret="secret",
        token_ttl_seconds=600,
    )
    token = build_livekit_access_token(
        config=cfg,
        tenant_id=uuid4(),
        classroom_id=uuid4(),
        session_id=uuid4(),
        participant_identity="participant-1",
        participant_name="Participant 1",
    )
    assert token.token.count(".") == 2
    assert token.ws_url == "wss://example.livekit.cloud"
    assert token.room_name
