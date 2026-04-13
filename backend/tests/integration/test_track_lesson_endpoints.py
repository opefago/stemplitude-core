from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom, ClassroomSession
from app.curriculum.models import Course
from app.lesson_content.models import Lesson
from app.roles.models import Permission, Role, RolePermission
from app.tenants.models import Tenant

pytestmark = pytest.mark.integration


async def _grant_permissions(db: AsyncSession, tenant_id) -> None:
    role = (
        await db.execute(
            select(Role).where(Role.tenant_id == tenant_id, Role.slug == "admin")
        )
    ).scalar_one()

    required = [
        ("curriculum", "view"),
        ("curriculum", "create"),
        ("curriculum", "update"),
        ("classrooms", "view"),
        ("classrooms", "update"),
        ("progress", "view"),
    ]
    for resource, action in required:
        permission = (
            await db.execute(
                select(Permission).where(
                    Permission.resource == resource, Permission.action == action
                )
            )
        ).scalar_one_or_none()
        if not permission:
            permission = Permission(
                id=uuid4(),
                resource=resource,
                action=action,
                description=f"{action} {resource}",
            )
            db.add(permission)
            await db.flush()
        exists = (
            await db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            )
        ).scalar_one_or_none()
        if not exists:
            db.add(
                RolePermission(
                    id=uuid4(),
                    role_id=role.id,
                    permission_id=permission.id,
                )
            )
    await db.flush()


async def test_track_lesson_end_to_end_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_tenant: Tenant,
    create_test_student,
    tenant_auth_headers: dict,
) -> None:
    await _grant_permissions(db_session, create_test_tenant.id)

    classroom = Classroom(
        id=uuid4(),
        tenant_id=create_test_tenant.id,
        name="Track Classroom",
        join_code="trk12345",
    )
    db_session.add(classroom)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    session = ClassroomSession(
        id=uuid4(),
        classroom_id=classroom.id,
        tenant_id=create_test_tenant.id,
        session_start=now,
        session_end=now + timedelta(hours=1),
    )
    db_session.add(session)

    curriculum = Course(
        id=uuid4(),
        tenant_id=create_test_tenant.id,
        title="Curriculum A",
        description="For assignment test",
    )
    db_session.add(curriculum)
    await db_session.flush()

    create_lesson_resp = await client.post(
        "/api/v1/tenant/lessons",
        headers=tenant_auth_headers,
        json={
            "title": "Intro Lesson",
            "summary": "Electric basics",
            "transcript": "resonance marker phrase",
            "resources": [{"resource_type": "notes", "title": "Notes"}],
        },
    )
    assert create_lesson_resp.status_code == 200
    lesson_id = create_lesson_resp.json()["id"]

    create_track_resp = await client.post(
        "/api/v1/tenant/tracks",
        headers=tenant_auth_headers,
        json={
            "title": "Foundations Track",
            "lessons": [{"lesson_id": lesson_id, "order_index": 0}],
        },
    )
    assert create_track_resp.status_code == 200
    track_id = create_track_resp.json()["id"]

    assign_classroom_resp = await client.post(
        f"/api/v1/tenant/classrooms/{classroom.id}/track-assignments",
        headers=tenant_auth_headers,
        json={"track_id": track_id},
    )
    assert assign_classroom_resp.status_code == 200
    assignment_data = assign_classroom_resp.json()
    assert assignment_data["track_instance_id"]

    assign_curriculum_resp = await client.post(
        f"/api/v1/tenant/curriculums/{curriculum.id}/track-assignments",
        headers=tenant_auth_headers,
        json={"track_id": track_id},
    )
    assert assign_curriculum_resp.status_code == 200

    suggested_resp = await client.get(
        f"/api/v1/classrooms/{classroom.id}/sessions/{session.id}/suggested-lesson",
        headers=tenant_auth_headers,
    )
    assert suggested_resp.status_code == 200
    suggested = suggested_resp.json()
    assert suggested["lesson_id"] == lesson_id

    coverage_resp = await client.post(
        f"/api/v1/classrooms/{classroom.id}/sessions/{session.id}/coverage",
        headers=tenant_auth_headers,
        json={
            "track_instance_id": assignment_data["track_instance_id"],
            "lesson_id": lesson_id,
            "selection_type": "suggested",
            "coverage_status": "completed",
        },
    )
    assert coverage_resp.status_code == 200

    progress_resp = await client.get(
        "/api/v1/tenant/progress/overview",
        headers=tenant_auth_headers,
        params={
            "student_id": str(create_test_student.id),
            "track_instance_id": assignment_data["track_instance_id"],
        },
    )
    assert progress_resp.status_code == 200
    assert progress_resp.json()["completion_percent"] == 100

    search_resp = await client.get(
        "/api/v1/search/content",
        headers=tenant_auth_headers,
        params={"q": "resonance marker"},
    )
    assert search_resp.status_code == 200
    search_rows = search_resp.json()
    assert any(row["content_type"] == "lesson" and row["content_id"] == lesson_id for row in search_rows)


async def test_cross_tenant_track_assignment_is_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_tenant: Tenant,
    tenant_auth_headers: dict,
) -> None:
    await _grant_permissions(db_session, create_test_tenant.id)

    local_classroom = Classroom(
        id=uuid4(),
        tenant_id=create_test_tenant.id,
        name="Tenant A Classroom",
        join_code="tenantA1",
    )
    db_session.add(local_classroom)

    tenant_b = Tenant(
        id=uuid4(),
        name="Tenant B",
        slug="tenant-b",
        code="TNTB01",
        type="center",
        is_active=True,
    )
    db_session.add(tenant_b)
    await db_session.flush()

    foreign_track_resp = await client.post(
        "/api/v1/tenant/tracks",
        headers={
            "Authorization": tenant_auth_headers["Authorization"],
            "X-Tenant-ID": str(tenant_b.id),
        },
        json={"title": "Foreign track"},
    )
    # Caller has no membership in tenant B; create the row directly for isolation test.
    if foreign_track_resp.status_code != 200:
        from app.lesson_content.models import Track

        foreign_track_id = uuid4()
        db_session.add(
            Track(
                id=foreign_track_id,
                tenant_id=tenant_b.id,
                owner_type="tenant",
                title="Foreign track",
            )
        )
        await db_session.flush()
    else:
        foreign_track_id = foreign_track_resp.json()["id"]

    assign_resp = await client.post(
        f"/api/v1/tenant/classrooms/{local_classroom.id}/track-assignments",
        headers=tenant_auth_headers,
        json={"track_id": str(foreign_track_id)},
    )

    assert assign_resp.status_code == 403
    assert "Forbidden" in assign_resp.json()["detail"]


async def test_search_hides_other_tenant_private_content(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_tenant: Tenant,
    tenant_auth_headers: dict,
) -> None:
    await _grant_permissions(db_session, create_test_tenant.id)

    foreign_tenant = Tenant(
        id=uuid4(),
        name="Foreign Tenant",
        slug="foreign-tenant",
        code="FRGN01",
        type="center",
        is_active=True,
    )
    db_session.add(foreign_tenant)
    await db_session.flush()

    hidden_lesson = Lesson(
        id=uuid4(),
        tenant_id=foreign_tenant.id,
        owner_type="tenant",
        visibility="tenant_only",
        status="published",
        title="Secret Resonance Lesson",
        summary="Should not be visible outside owner tenant",
    )
    db_session.add(hidden_lesson)
    await db_session.flush()

    visible_lesson = Lesson(
        id=uuid4(),
        tenant_id=None,
        owner_type="stemplitude",
        visibility="public",
        status="published",
        title="Public Resonance Lesson",
        summary="Visible to all tenants",
    )
    db_session.add(visible_lesson)
    await db_session.flush()

    search_resp = await client.get(
        "/api/v1/search/content",
        headers=tenant_auth_headers,
        params={"q": "Resonance"},
    )
    assert search_resp.status_code == 200

    rows = search_resp.json()
    row_ids = {row["content_id"] for row in rows if row["content_type"] == "lesson"}
    assert str(visible_lesson.id) in row_ids
    assert str(hidden_lesson.id) not in row_ids
