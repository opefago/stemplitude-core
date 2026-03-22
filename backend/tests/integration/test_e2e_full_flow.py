"""End-to-end integration tests exercising complete user journeys.

Each test class walks through a real-world flow from account creation
through to the final action, hitting the API endpoints sequentially.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration

API = "/api/v1"


# ---------------------------------------------------------------------------
# Flow 1: Admin registers → creates tenant → creates program → builds
#          curriculum → creates classroom → creates student → enrolls
#          student → creates session → records attendance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAdminFullFlow:
    """Full lifecycle: register, tenant, program, curriculum, classroom,
    student, enrollment, session, and attendance."""

    async def test_full_admin_journey(self, client, db_session):
        # 1. Register a new user
        reg = await client.post(f"{API}/auth/register", json={
            "email": "admin_flow@example.com",
            "password": "SecurePass123!",
            "first_name": "Flow",
            "last_name": "Admin",
        })
        assert reg.status_code == 200, reg.text
        tokens = reg.json()
        access_token = tokens["access_token"]
        assert access_token

        # Verify /me
        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {access_token}",
        })
        assert me.status_code == 200
        user_id = me.json()["id"]
        assert me.json()["email"] == "admin_flow@example.com"

        # 2. Create a tenant (via DB fixture since the endpoint has a known bug)
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role, Permission, RolePermission

        tenant = Tenant(
            id=uuid4(),
            name="E2E Test Center",
            slug="e2e-test-center",
            code="E2ETEST",
            type="center",
            is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        admin_role = Role(
            id=uuid4(),
            tenant_id=tenant.id,
            name="Administrator",
            slug="admin",
            is_system=True,
            is_active=True,
        )
        instructor_role = Role(
            id=uuid4(),
            tenant_id=tenant.id,
            name="Instructor",
            slug="instructor",
            is_system=True,
            is_active=True,
        )
        student_role = Role(
            id=uuid4(),
            tenant_id=tenant.id,
            name="Student",
            slug="student",
            is_system=True,
            is_active=True,
        )
        for r in (admin_role, instructor_role, student_role):
            db_session.add(r)
        await db_session.flush()

        # Grant wildcard permissions to admin role
        resources = [
            "classrooms", "students", "programs", "curriculum",
            "roles", "tenants", "subscriptions",
        ]
        for res in resources:
            perm = Permission(id=uuid4(), resource=res, action="*")
            db_session.add(perm)
            await db_session.flush()
            db_session.add(RolePermission(
                id=uuid4(), role_id=admin_role.id, permission_id=perm.id,
            ))
        await db_session.flush()

        from uuid import UUID
        membership = Membership(
            id=uuid4(),
            user_id=UUID(user_id),
            tenant_id=tenant.id,
            role_id=admin_role.id,
            is_active=True,
        )
        db_session.add(membership)
        await db_session.flush()

        # Generate tenant-scoped token
        from app.core.security import create_access_token
        tenant_token = create_access_token(
            sub=UUID(user_id), sub_type="user", tenant_id=tenant.id,
        )
        headers = {
            "Authorization": f"Bearer {tenant_token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # 3. Create a program
        prog_res = await client.post(f"{API}/programs/", json={
            "name": "Robotics 101",
            "description": "Intro to robotics for beginners",
        }, headers=headers)
        assert prog_res.status_code == 201, prog_res.text
        program = prog_res.json()
        program_id = program["id"]
        assert program["name"] == "Robotics 101"

        # List programs
        prog_list = await client.get(f"{API}/programs/", headers=headers)
        assert prog_list.status_code == 200
        assert len(prog_list.json()) >= 1

        # Get program by ID
        prog_get = await client.get(f"{API}/programs/{program_id}", headers=headers)
        assert prog_get.status_code == 200
        assert prog_get.json()["name"] == "Robotics 101"

        # Update program
        prog_upd = await client.patch(f"{API}/programs/{program_id}", json={
            "description": "Updated description",
        }, headers=headers)
        assert prog_upd.status_code == 200
        assert prog_upd.json()["description"] == "Updated description"

        # 4. Create curriculum: course → module → lesson → lab
        course_res = await client.post(f"{API}/curriculum/courses", json={
            "title": "Sensors & Motors",
            "description": "Learn about sensors and motors",
            "difficulty": "beginner",
            "sort_order": 1,
        }, headers=headers)
        assert course_res.status_code == 201, course_res.text
        course = course_res.json()
        course_id = course["id"]

        module_res = await client.post(
            f"{API}/curriculum/courses/{course_id}/modules",
            json={"title": "Ultrasonic Sensors", "sort_order": 1},
            headers=headers,
        )
        assert module_res.status_code == 201, module_res.text
        module = module_res.json()
        module_id = module["id"]

        lesson_res = await client.post(
            f"{API}/curriculum/modules/{module_id}/lessons",
            json={
                "title": "Distance Measurement",
                "content_type": "interactive",
                "sort_order": 1,
                "duration_minutes": 45,
            },
            headers=headers,
        )
        assert lesson_res.status_code == 201, lesson_res.text
        lesson = lesson_res.json()
        lesson_id = lesson["id"]

        lab_res = await client.post(
            f"{API}/curriculum/lessons/{lesson_id}/labs",
            json={
                "lab_type": "robotics_lab",
                "title": "Build a Distance Sensor",
                "config": {"grid_size": 8},
            },
            headers=headers,
        )
        assert lab_res.status_code == 201, lab_res.text
        lab = lab_res.json()
        assert lab["lab_type"] == "robotics_lab"
        lab_id = lab["id"]

        # 5. Create a classroom linked to the program
        cr_res = await client.post(f"{API}/classrooms/", json={
            "name": "Monday Robotics",
            "program_id": program_id,
            "mode": "online",
            "max_students": 20,
            "timezone": "America/New_York",
        }, headers=headers)
        assert cr_res.status_code == 201, cr_res.text
        classroom = cr_res.json()
        classroom_id = classroom["id"]
        assert classroom["join_code"]
        assert classroom["program_id"] == program_id

        # List classrooms
        cr_list = await client.get(f"{API}/classrooms/", headers=headers)
        assert cr_list.status_code == 200
        assert any(c["id"] == classroom_id for c in cr_list.json())

        # Get classroom
        cr_get = await client.get(f"{API}/classrooms/{classroom_id}", headers=headers)
        assert cr_get.status_code == 200
        assert cr_get.json()["name"] == "Monday Robotics"

        # Update classroom
        cr_upd = await client.patch(f"{API}/classrooms/{classroom_id}", json={
            "max_students": 25,
        }, headers=headers)
        assert cr_upd.status_code == 200
        assert cr_upd.json()["max_students"] == 25

        # 6. Create a student
        stu_res = await client.post(f"{API}/students/", json={
            "first_name": "Alex",
            "last_name": "Rivera",
            "username": "alex_flow",
            "password": "Student123!",
            "grade_level": "5th",
        }, headers=headers)
        assert stu_res.status_code == 201, stu_res.text
        student = stu_res.json()
        student_id = student["id"]
        assert student["first_name"] == "Alex"

        # List students
        stu_list = await client.get(f"{API}/students/", headers=headers)
        assert stu_list.status_code == 200
        assert any(s["id"] == student_id for s in stu_list.json())

        # Get student
        stu_get = await client.get(f"{API}/students/{student_id}", headers=headers)
        assert stu_get.status_code == 200
        assert stu_get.json()["last_name"] == "Rivera"

        # Update student
        stu_upd = await client.patch(f"{API}/students/{student_id}", json={
            "display_name": "Alex R.",
        }, headers=headers)
        assert stu_upd.status_code == 200
        assert stu_upd.json()["display_name"] == "Alex R."

        # 7. Enroll student in classroom
        enroll_res = await client.post(
            f"{API}/classrooms/{classroom_id}/enroll",
            json={"student_id": student_id},
            headers=headers,
        )
        assert enroll_res.status_code == 201, enroll_res.text
        enrollment = enroll_res.json()
        assert enrollment["student_id"] == student_id
        assert enrollment["classroom_id"] == classroom_id

        # List enrolled students
        enrolled = await client.get(
            f"{API}/classrooms/{classroom_id}/students", headers=headers,
        )
        assert enrolled.status_code == 200
        assert len(enrolled.json()) == 1
        assert enrolled.json()[0]["student_id"] == student_id

        # 8. Create a classroom session
        session_res = await client.post(
            f"{API}/classrooms/{classroom_id}/sessions",
            json={
                "session_start": "2026-04-01T14:00:00Z",
                "session_end": "2026-04-01T15:30:00Z",
                "notes": "Week 1 - Introduction",
            },
            headers=headers,
        )
        assert session_res.status_code == 201, session_res.text
        session = session_res.json()
        session_id = session["id"]
        assert session["status"] == "scheduled"

        # 9. Record attendance
        att_res = await client.post(
            f"{API}/classrooms/{classroom_id}/attendance",
            json={
                "student_id": student_id,
                "session_id": session_id,
                "status": "present",
            },
            headers=headers,
        )
        assert att_res.status_code == 201, att_res.text
        attendance = att_res.json()
        assert attendance["status"] == "present"
        assert attendance["student_id"] == student_id

        # Get attendance for classroom
        att_list = await client.get(
            f"{API}/classrooms/{classroom_id}/attendance", headers=headers,
        )
        assert att_list.status_code == 200
        assert len(att_list.json()) == 1

        # Get attendance filtered by session
        att_filtered = await client.get(
            f"{API}/classrooms/{classroom_id}/attendance",
            params={"session_id": session_id},
            headers=headers,
        )
        assert att_filtered.status_code == 200
        assert len(att_filtered.json()) == 1

        # 10. Verify curriculum listing
        courses = await client.get(f"{API}/curriculum/courses", headers=headers)
        assert courses.status_code == 200
        assert any(c["id"] == course_id for c in courses.json())

        modules = await client.get(
            f"{API}/curriculum/courses/{course_id}/modules", headers=headers,
        )
        assert modules.status_code == 200
        assert any(m["id"] == module_id for m in modules.json())

        lessons = await client.get(
            f"{API}/curriculum/modules/{module_id}/lessons", headers=headers,
        )
        assert lessons.status_code == 200
        assert any(l["id"] == lesson_id for l in lessons.json())

        labs = await client.get(
            f"{API}/curriculum/lessons/{lesson_id}/labs", headers=headers,
        )
        assert labs.status_code == 200
        assert any(l["id"] == lab_id for l in labs.json())


# ---------------------------------------------------------------------------
# Flow 2: Student self-registers → logs in → views profile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestStudentSelfRegisterFlow:
    """Student self-registration, login, and profile access."""

    async def test_student_self_register_and_login(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant
        from app.roles.models import Role

        tenant = Tenant(
            id=uuid4(),
            name="Self-Reg Academy",
            slug="self-reg-academy",
            code="SELFREG",
            type="center",
            is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        for slug, name in [("admin", "Admin"), ("instructor", "Instructor"), ("student", "Student")]:
            db_session.add(Role(
                id=uuid4(), tenant_id=tenant.id, name=name,
                slug=slug, is_system=True, is_active=True,
            ))
        await db_session.flush()

        # 1. Self-register
        reg = await client.post(f"{API}/students/self-register", json={
            "first_name": "Zara",
            "last_name": "Khan",
            "username": "zara_k",
            "password": "Student456!",
            "tenant_slug": "self-reg-academy",
            "grade_level": "6th",
        })
        assert reg.status_code == 201, reg.text
        student = reg.json()
        assert student["first_name"] == "Zara"
        assert student["is_active"] is True
        student_id = student["id"]

        # 2. Student login
        login = await client.post(f"{API}/auth/student-login", json={
            "username": "zara_k",
            "password": "Student456!",
            "tenant_slug": "self-reg-academy",
        })
        assert login.status_code == 200, login.text
        tokens = login.json()
        student_token = tokens["access_token"]
        assert student_token

        # 3. View profile via /me
        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {student_token}",
        })
        assert me.status_code == 200
        profile = me.json()
        assert profile["first_name"] == "Zara"

        # 4. Resolve tenant publicly
        resolve = await client.get(f"{API}/auth/tenants/resolve/self-reg-academy")
        assert resolve.status_code == 200
        assert resolve.json()["slug"] == "self-reg-academy"


# ---------------------------------------------------------------------------
# Flow 3: Curriculum CRUD — create, read, update, delete across all levels
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCurriculumCRUD:
    """Full CRUD lifecycle on course → module → lesson → lab."""

    async def test_curriculum_full_crud(self, client, db_session):
        from uuid import uuid4, UUID
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role, Permission, RolePermission
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        # Setup user + tenant + permissions
        user = User(
            id=uuid4(), email="curriculum@example.com",
            password_hash=hash_password("CurrPass123!"),
            first_name="Curr", last_name="Admin",
            is_active=True, is_super_admin=True,
        )
        db_session.add(user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Curriculum Center",
            slug="curr-center", code="CURR01",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Admin", slug="admin",
            is_system=True, is_active=True,
        )
        db_session.add(role)
        await db_session.flush()

        db_session.add(Membership(
            id=uuid4(), user_id=user.id,
            tenant_id=tenant.id, role_id=role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(
            sub=user.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # CREATE course
        res = await client.post(f"{API}/curriculum/courses", json={
            "title": "Electronics 101",
            "description": "Intro to circuits",
            "difficulty": "beginner",
        }, headers=headers)
        assert res.status_code == 201
        course_id = res.json()["id"]

        # UPDATE course
        res = await client.patch(f"{API}/curriculum/courses/{course_id}", json={
            "title": "Electronics Fundamentals",
            "is_published": True,
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["title"] == "Electronics Fundamentals"
        assert res.json()["is_published"] is True

        # CREATE module
        res = await client.post(
            f"{API}/curriculum/courses/{course_id}/modules",
            json={"title": "Resistors", "sort_order": 1},
            headers=headers,
        )
        assert res.status_code == 201
        module_id = res.json()["id"]

        # UPDATE module
        res = await client.patch(f"{API}/curriculum/modules/{module_id}", json={
            "title": "Resistors & Capacitors",
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["title"] == "Resistors & Capacitors"

        # CREATE lesson
        res = await client.post(
            f"{API}/curriculum/modules/{module_id}/lessons",
            json={
                "title": "Ohm's Law",
                "content_type": "text",
                "content": "V = IR",
                "duration_minutes": 30,
            },
            headers=headers,
        )
        assert res.status_code == 201
        lesson_id = res.json()["id"]

        # UPDATE lesson
        res = await client.patch(f"{API}/curriculum/lessons/{lesson_id}", json={
            "duration_minutes": 45,
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["duration_minutes"] == 45

        # CREATE lab
        res = await client.post(
            f"{API}/curriculum/lessons/{lesson_id}/labs",
            json={
                "lab_type": "electronics_lab",
                "title": "Build a Series Circuit",
                "config": {"components": ["resistor", "led", "battery"]},
            },
            headers=headers,
        )
        assert res.status_code == 201
        lab_id = res.json()["id"]

        # UPDATE lab
        res = await client.patch(f"{API}/curriculum/labs/{lab_id}", json={
            "title": "Series & Parallel Circuits",
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["title"] == "Series & Parallel Circuits"

        # DELETE lab
        res = await client.delete(f"{API}/curriculum/labs/{lab_id}", headers=headers)
        assert res.status_code == 204

        # Verify lab deleted
        res = await client.get(
            f"{API}/curriculum/lessons/{lesson_id}/labs", headers=headers,
        )
        assert res.status_code == 200
        assert not any(l["id"] == lab_id for l in res.json())

        # DELETE lesson
        res = await client.delete(f"{API}/curriculum/lessons/{lesson_id}", headers=headers)
        assert res.status_code == 204

        # DELETE module
        res = await client.delete(f"{API}/curriculum/modules/{module_id}", headers=headers)
        assert res.status_code == 204

        # DELETE course
        res = await client.delete(f"{API}/curriculum/courses/{course_id}", headers=headers)
        assert res.status_code == 204

        # Verify course deleted
        res = await client.get(f"{API}/curriculum/courses", headers=headers)
        assert res.status_code == 200
        assert not any(c["id"] == course_id for c in res.json())


# ---------------------------------------------------------------------------
# Flow 4: Program CRUD — create, list, get, update, delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestProgramCRUD:
    """Full CRUD on programs."""

    async def test_program_lifecycle(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        user = User(
            id=uuid4(), email="prog_admin@example.com",
            password_hash=hash_password("ProgPass123!"),
            first_name="Prog", last_name="Admin",
            is_active=True, is_super_admin=True,
        )
        db_session.add(user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Program Center",
            slug="prog-center", code="PROG01",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Admin", slug="admin",
            is_system=True, is_active=True,
        )
        db_session.add(role)
        await db_session.flush()

        db_session.add(Membership(
            id=uuid4(), user_id=user.id,
            tenant_id=tenant.id, role_id=role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(
            sub=user.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # CREATE
        res = await client.post(f"{API}/programs/", json={
            "name": "Summer STEM Camp",
            "description": "6-week summer program",
        }, headers=headers)
        assert res.status_code == 201
        prog_id = res.json()["id"]

        # LIST
        res = await client.get(f"{API}/programs/", headers=headers)
        assert res.status_code == 200
        assert any(p["id"] == prog_id for p in res.json())

        # GET
        res = await client.get(f"{API}/programs/{prog_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == "Summer STEM Camp"

        # UPDATE
        res = await client.patch(f"{API}/programs/{prog_id}", json={
            "name": "Summer STEM Camp 2026",
            "is_active": False,
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == "Summer STEM Camp 2026"
        assert res.json()["is_active"] is False

        # DELETE
        res = await client.delete(f"{API}/programs/{prog_id}", headers=headers)
        assert res.status_code == 204

        # Verify deleted
        res = await client.get(f"{API}/programs/{prog_id}", headers=headers)
        assert res.status_code == 404


# ---------------------------------------------------------------------------
# Flow 5: Classroom management — sessions, enroll/unenroll, attendance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestClassroomManagement:
    """Classroom operations: sessions, enrollment, unenrollment, attendance."""

    async def test_classroom_enroll_unenroll_attendance(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        user = User(
            id=uuid4(), email="class_admin@example.com",
            password_hash=hash_password("ClassPass123!"),
            first_name="Class", last_name="Admin",
            is_active=True, is_super_admin=True,
        )
        db_session.add(user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Classroom Center",
            slug="class-center", code="CLASS01",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Admin", slug="admin",
            is_system=True, is_active=True,
        )
        db_session.add(role)
        await db_session.flush()

        db_session.add(Membership(
            id=uuid4(), user_id=user.id,
            tenant_id=tenant.id, role_id=role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(
            sub=user.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # Create classroom
        res = await client.post(f"{API}/classrooms/", json={
            "name": "Wednesday Lab",
            "mode": "in-person",
            "location_address": "123 STEM Street",
            "max_students": 10,
        }, headers=headers)
        assert res.status_code == 201, res.text
        classroom_id = res.json()["id"]

        # Create two students
        students = []
        for i, (first, last, uname) in enumerate([
            ("Sam", "Lee", "sam_lee"),
            ("Pat", "Kim", "pat_kim"),
        ]):
            res = await client.post(f"{API}/students/", json={
                "first_name": first,
                "last_name": last,
                "username": uname,
                "password": "Student123!",
            }, headers=headers)
            assert res.status_code == 201, res.text
            students.append(res.json())

        # Enroll both students
        for s in students:
            res = await client.post(
                f"{API}/classrooms/{classroom_id}/enroll",
                json={"student_id": s["id"]},
                headers=headers,
            )
            assert res.status_code == 201, res.text

        # List enrolled students
        res = await client.get(
            f"{API}/classrooms/{classroom_id}/students", headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

        # Create two sessions
        sessions = []
        for day, notes in [("2026-04-01", "Week 1"), ("2026-04-08", "Week 2")]:
            res = await client.post(
                f"{API}/classrooms/{classroom_id}/sessions",
                json={
                    "session_start": f"{day}T14:00:00Z",
                    "session_end": f"{day}T15:30:00Z",
                    "notes": notes,
                },
                headers=headers,
            )
            assert res.status_code == 201, res.text
            sessions.append(res.json())

        # Record attendance: Sam present session 1, Pat absent session 1
        att1 = await client.post(
            f"{API}/classrooms/{classroom_id}/attendance",
            json={
                "student_id": students[0]["id"],
                "session_id": sessions[0]["id"],
                "status": "present",
            },
            headers=headers,
        )
        assert att1.status_code == 201

        att2 = await client.post(
            f"{API}/classrooms/{classroom_id}/attendance",
            json={
                "student_id": students[1]["id"],
                "session_id": sessions[0]["id"],
                "status": "absent",
                "notes": "Family emergency",
            },
            headers=headers,
        )
        assert att2.status_code == 201
        assert att2.json()["status"] == "absent"

        # Query attendance for session 1
        res = await client.get(
            f"{API}/classrooms/{classroom_id}/attendance",
            params={"session_id": sessions[0]["id"]},
            headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

        # Unenroll the second student
        res = await client.delete(
            f"{API}/classrooms/{classroom_id}/students/{students[1]['id']}",
            headers=headers,
        )
        assert res.status_code == 204

        # Verify only one student remains
        res = await client.get(
            f"{API}/classrooms/{classroom_id}/students", headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["student_id"] == students[0]["id"]


# ---------------------------------------------------------------------------
# Flow 6: Student management — create, parent link, password reset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestStudentManagement:
    """Student lifecycle: create, link parent, reset password, re-login."""

    async def test_student_parent_link_and_password_reset(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        parent_user = User(
            id=uuid4(), email="parent@example.com",
            password_hash=hash_password("ParentPass123!"),
            first_name="Jane", last_name="Doe",
            is_active=True, is_super_admin=True,
        )
        db_session.add(parent_user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Parent Test Center",
            slug="parent-test", code="PAR001",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        for slug, name in [("admin", "Admin"), ("instructor", "Instructor"), ("student", "Student")]:
            db_session.add(Role(
                id=uuid4(), tenant_id=tenant.id, name=name,
                slug=slug, is_system=True, is_active=True,
            ))
        await db_session.flush()

        from sqlalchemy import select
        result = await db_session.execute(
            select(Role).where(Role.tenant_id == tenant.id, Role.slug == "admin")
        )
        admin_role = result.scalar_one()

        db_session.add(Membership(
            id=uuid4(), user_id=parent_user.id,
            tenant_id=tenant.id, role_id=admin_role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(
            sub=parent_user.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # Create student
        res = await client.post(f"{API}/students/", json={
            "first_name": "Kid",
            "last_name": "Doe",
            "username": "kid_doe",
            "password": "KidPass123!",
        }, headers=headers)
        assert res.status_code == 201, res.text
        student_id = res.json()["id"]

        # Link parent to student
        res = await client.post(
            f"{API}/students/{student_id}/parents",
            json={
                "user_id": str(parent_user.id),
                "relationship": "parent",
                "is_primary_contact": True,
            },
            headers=headers,
        )
        assert res.status_code == 201, res.text
        assert res.json()["relationship"] == "parent"
        assert res.json()["is_primary_contact"] is True

        # List parents
        res = await client.get(
            f"{API}/students/{student_id}/parents", headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["user_id"] == str(parent_user.id)

        # Reset student password
        res = await client.post(
            f"{API}/students/{student_id}/reset-password",
            json={"new_password": "NewKidPass123!"},
            headers=headers,
        )
        assert res.status_code == 204

        # Student login with new password
        login = await client.post(f"{API}/auth/student-login", json={
            "username": "kid_doe",
            "password": "NewKidPass123!",
            "tenant_slug": "parent-test",
        })
        assert login.status_code == 200, login.text
        assert login.json()["access_token"]


# ---------------------------------------------------------------------------
# Flow 7: Roles & permissions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestRolesAndPermissions:
    """Role CRUD and permission enforcement."""

    async def test_roles_and_permission_enforcement(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role, Permission, RolePermission
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        # Super admin who sets everything up
        admin = User(
            id=uuid4(), email="role_admin@example.com",
            password_hash=hash_password("RolePass123!"),
            first_name="Role", last_name="Admin",
            is_active=True, is_super_admin=True,
        )
        db_session.add(admin)
        await db_session.flush()

        # Regular instructor user
        instructor = User(
            id=uuid4(), email="instructor@example.com",
            password_hash=hash_password("InstrPass123!"),
            first_name="Ins", last_name="Tructor",
            is_active=True, is_super_admin=False,
        )
        db_session.add(instructor)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Perm Test Center",
            slug="perm-test", code="PERM01",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        admin_role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Admin", slug="admin",
            is_system=True, is_active=True,
        )
        instr_role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Instructor", slug="instructor",
            is_system=True, is_active=True,
        )
        db_session.add(admin_role)
        db_session.add(instr_role)
        await db_session.flush()

        # Give instructor role only "classrooms:view" permission
        view_perm = Permission(id=uuid4(), resource="classrooms", action="view")
        db_session.add(view_perm)
        await db_session.flush()
        db_session.add(RolePermission(
            id=uuid4(), role_id=instr_role.id, permission_id=view_perm.id,
        ))
        await db_session.flush()

        # Memberships
        db_session.add(Membership(
            id=uuid4(), user_id=admin.id,
            tenant_id=tenant.id, role_id=admin_role.id, is_active=True,
        ))
        db_session.add(Membership(
            id=uuid4(), user_id=instructor.id,
            tenant_id=tenant.id, role_id=instr_role.id, is_active=True,
        ))
        await db_session.flush()

        admin_token = create_access_token(
            sub=admin.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        admin_headers = {
            "Authorization": f"Bearer {admin_token}",
            "X-Tenant-ID": str(tenant.id),
        }

        instr_token = create_access_token(
            sub=instructor.id, sub_type="user", tenant_id=tenant.id,
        )
        instr_headers = {
            "Authorization": f"Bearer {instr_token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # Admin creates a classroom
        res = await client.post(f"{API}/classrooms/", json={
            "name": "Perm Test Classroom",
            "mode": "online",
        }, headers=admin_headers)
        assert res.status_code == 201
        classroom_id = res.json()["id"]

        # Instructor can view classrooms
        res = await client.get(f"{API}/classrooms/", headers=instr_headers)
        assert res.status_code == 200

        # Instructor cannot create classrooms (no classrooms:create permission)
        res = await client.post(f"{API}/classrooms/", json={
            "name": "Should Fail",
            "mode": "online",
        }, headers=instr_headers)
        assert res.status_code == 403

        # Instructor cannot create students (no students:create permission)
        res = await client.post(f"{API}/students/", json={
            "first_name": "No", "last_name": "Access",
            "username": "noaccess", "password": "NoAccess123!",
        }, headers=instr_headers)
        assert res.status_code == 403


# ---------------------------------------------------------------------------
# Flow 8: Auth token lifecycle — login, refresh, logout, token revoked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAuthTokenLifecycle:
    """Complete auth flow: register, login, refresh, logout, verify revocation."""

    async def test_token_lifecycle(self, client, db_session):
        # Register
        reg = await client.post(f"{API}/auth/register", json={
            "email": "lifecycle@example.com",
            "password": "LifePass123!",
            "first_name": "Life",
            "last_name": "Cycle",
        })
        assert reg.status_code == 200
        tokens = reg.json()

        # Login
        login = await client.post(f"{API}/auth/login", json={
            "email": "lifecycle@example.com",
            "password": "LifePass123!",
        })
        assert login.status_code == 200
        access = login.json()["access_token"]
        refresh = login.json()["refresh_token"]

        # Access /me
        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {access}",
        })
        assert me.status_code == 200

        # Refresh
        ref_res = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert ref_res.status_code == 200
        new_access = ref_res.json()["access_token"]
        assert new_access != access

        # Logout
        logout = await client.post(f"{API}/auth/logout", json={
            "refresh_token": refresh,
        }, headers={"Authorization": f"Bearer {new_access}"})
        assert logout.status_code == 200

        # Refresh after logout should fail
        ref_fail = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert ref_fail.status_code in (401, 400)


# ---------------------------------------------------------------------------
# Flow 9: Multi-classroom enrollment — one student in multiple classrooms
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestMultiClassroomEnrollment:
    """Student enrolled in multiple classrooms under one tenant."""

    async def test_student_in_multiple_classrooms(self, client, db_session):
        from uuid import uuid4
        from app.tenants.models import Tenant, Membership
        from app.roles.models import Role
        from app.users.models import User
        from app.core.security import hash_password, create_access_token

        user = User(
            id=uuid4(), email="multi_class@example.com",
            password_hash=hash_password("MultiPass123!"),
            first_name="Multi", last_name="Class",
            is_active=True, is_super_admin=True,
        )
        db_session.add(user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name="Multi Class Center",
            slug="multi-class", code="MULTI01",
            type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        role = Role(
            id=uuid4(), tenant_id=tenant.id,
            name="Admin", slug="admin",
            is_system=True, is_active=True,
        )
        db_session.add(role)
        await db_session.flush()

        db_session.add(Membership(
            id=uuid4(), user_id=user.id,
            tenant_id=tenant.id, role_id=role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(
            sub=user.id, sub_type="user", tenant_id=tenant.id,
            extra_claims={"is_super_admin": True},
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # Create a student
        res = await client.post(f"{API}/students/", json={
            "first_name": "Multi",
            "last_name": "Enrolled",
            "username": "multi_enrolled",
            "password": "Student123!",
        }, headers=headers)
        assert res.status_code == 201
        student_id = res.json()["id"]

        # Create three classrooms
        classroom_ids = []
        for name in ["Monday Robotics", "Wednesday Electronics", "Friday Coding"]:
            res = await client.post(f"{API}/classrooms/", json={
                "name": name,
                "mode": "online",
            }, headers=headers)
            assert res.status_code == 201
            classroom_ids.append(res.json()["id"])

        # Enroll student in all three
        for cid in classroom_ids:
            res = await client.post(
                f"{API}/classrooms/{cid}/enroll",
                json={"student_id": student_id},
                headers=headers,
            )
            assert res.status_code == 201

        # Verify enrollment in each
        for cid in classroom_ids:
            res = await client.get(
                f"{API}/classrooms/{cid}/students", headers=headers,
            )
            assert res.status_code == 200
            assert any(s["student_id"] == student_id for s in res.json())

        # Unenroll from middle classroom
        res = await client.delete(
            f"{API}/classrooms/{classroom_ids[1]}/students/{student_id}",
            headers=headers,
        )
        assert res.status_code == 204

        # Confirm unenrolled from middle, still in others
        res = await client.get(
            f"{API}/classrooms/{classroom_ids[1]}/students", headers=headers,
        )
        assert res.status_code == 200
        assert not any(s["student_id"] == student_id for s in res.json())

        for cid in [classroom_ids[0], classroom_ids[2]]:
            res = await client.get(
                f"{API}/classrooms/{cid}/students", headers=headers,
            )
            assert res.status_code == 200
            assert any(s["student_id"] == student_id for s in res.json())
