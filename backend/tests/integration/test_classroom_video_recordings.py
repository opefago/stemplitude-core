from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.classrooms.models import Classroom, ClassroomSession, ClassroomStudent
from app.config import settings

API = "/api/v1"


@pytest.mark.asyncio
async def test_issue_livekit_video_token_for_staff_and_enrolled_student(
    client,
    db_session,
    create_test_tenant,
    create_test_student,
    tenant_auth_headers,
    student_auth_token,
):
    classroom = Classroom(
        id=uuid4(),
        tenant_id=create_test_tenant.id,
        name="Video Classroom",
        mode="online",
        join_code="VIDEOT01",
        schedule={},
        settings={},
    )
    db_session.add(classroom)
    await db_session.flush()

    session = ClassroomSession(
        id=uuid4(),
        classroom_id=classroom.id,
        tenant_id=create_test_tenant.id,
        session_start=datetime.now(timezone.utc) - timedelta(minutes=10),
        session_end=datetime.now(timezone.utc) + timedelta(minutes=30),
        status="active",
    )
    db_session.add(session)
    db_session.add(
        ClassroomStudent(
            id=uuid4(),
            classroom_id=classroom.id,
            student_id=create_test_student.id,
        )
    )
    await db_session.commit()

    old_key = settings.LIVEKIT_API_KEY
    old_secret = settings.LIVEKIT_API_SECRET
    old_url = settings.LIVEKIT_WS_URL
    settings.LIVEKIT_API_KEY = "lk_test_key"
    settings.LIVEKIT_API_SECRET = "lk_test_secret"
    settings.LIVEKIT_WS_URL = "wss://example.livekit.cloud"
    try:
        staff_res = await client.post(
            f"{API}/classrooms/{classroom.id}/sessions/{session.id}/video-token",
            headers=tenant_auth_headers,
        )
        assert staff_res.status_code == 200
        staff_body = staff_res.json()
        assert staff_body["token"]
        assert staff_body["room_name"]
        assert staff_body["ws_url"] == "wss://example.livekit.cloud"

        student_res = await client.post(
            f"{API}/classrooms/{classroom.id}/sessions/{session.id}/video-token",
            headers={
                "Authorization": f"Bearer {student_auth_token}",
                "X-Tenant-ID": str(create_test_tenant.id),
            },
        )
        assert student_res.status_code == 200
        student_body = student_res.json()
        assert student_body["token"]
    finally:
        settings.LIVEKIT_API_KEY = old_key
        settings.LIVEKIT_API_SECRET = old_secret
        settings.LIVEKIT_WS_URL = old_url


@pytest.mark.asyncio
async def test_session_recording_lifecycle_endpoints(
    client,
    db_session,
    create_test_tenant,
    tenant_auth_headers,
):
    classroom = Classroom(
        id=uuid4(),
        tenant_id=create_test_tenant.id,
        name="Recording Classroom",
        mode="online",
        join_code="RECORD01",
        schedule={},
        settings={},
    )
    db_session.add(classroom)
    await db_session.flush()

    session = ClassroomSession(
        id=uuid4(),
        classroom_id=classroom.id,
        tenant_id=create_test_tenant.id,
        session_start=datetime.now(timezone.utc) - timedelta(minutes=15),
        session_end=datetime.now(timezone.utc) + timedelta(minutes=30),
        status="active",
    )
    db_session.add(session)
    await db_session.commit()

    start_res = await client.post(
        f"{API}/classrooms/{classroom.id}/sessions/{session.id}/recordings/start",
        headers=tenant_auth_headers,
        json={},
    )
    assert start_res.status_code == 200
    recording = start_res.json()
    rid = recording["id"]
    assert recording["status"] == "recording"

    stop_res = await client.post(
        f"{API}/classrooms/{classroom.id}/sessions/{session.id}/recordings/{rid}/stop",
        headers=tenant_auth_headers,
        json={
            "status": "ready",
            "blob_key": f"tenants/{create_test_tenant.id}/recordings/{session.id}/{rid}/recording.mp4",
            "duration_seconds": 120,
            "size_bytes": 4096,
        },
    )
    assert stop_res.status_code == 200
    assert stop_res.json()["status"] == "ready"

    list_res = await client.get(
        f"{API}/classrooms/{classroom.id}/sessions/{session.id}/recordings",
        headers=tenant_auth_headers,
    )
    assert list_res.status_code == 200
    assert any(item["id"] == rid for item in list_res.json())

    access_res = await client.post(
        f"{API}/classrooms/{classroom.id}/sessions/{session.id}/recordings/{rid}/access-link",
        headers=tenant_auth_headers,
    )
    assert access_res.status_code == 200
    assert access_res.json()["download_url"]

    delete_res = await client.delete(
        f"{API}/classrooms/{classroom.id}/sessions/{session.id}/recordings/{rid}",
        headers=tenant_auth_headers,
    )
    assert delete_res.status_code == 200
    assert delete_res.json()["status"] == "deleted"
