import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.students.models import ParentStudent, Student, StudentMembership
from app.students.repository import StudentRepository
from app.students.parent_access import ensure_can_view_student_as_guardian
from app.students.schemas import (
    GuardianChildControlsPatch,
    GuardianChildControlsResponse,
    ParentLinkRequest,
    ResetPasswordRequest,
    StudentCreate,
    StudentMembershipCreate,
    StudentSelfRegister,
    StudentUpdate,
)
from app.dependencies import CurrentIdentity
from app.tenants.models import Tenant
from app.classrooms.models import Classroom, ClassroomSession
from app.classrooms.schemas import SessionResponse
from app.classrooms.schedule_occurrences import merge_db_and_scheduled_upcoming

logger = logging.getLogger(__name__)

_GUARDIAN_MESSAGING_SCOPES = frozenset({"instructors_only", "classmates", "disabled"})

# When merging DB sessions with schedule-derived occurrences, fetch extra DB rows
# so the merged top-N is not mostly synthetic while real rows exist further out.
_UPCOMING_DB_FETCH_FACTOR = 5
_UPCOMING_DB_FETCH_CAP = 400
# Parent Events hub: month-scoped responses need a high merge cap so "later this month"
# is not empty when many occurrences fall in the next 7 days (sorted list filled early).
# Wider when session_start_before spans two calendar months (parent Events hub).
_UPCOMING_MONTH_AGGREGATE_MERGE_CAP = 2600
_UPCOMING_MONTH_AGGREGATE_DB_CAP = 1400


def _sessions_with_classroom_names(
    sessions: list[SessionResponse],
    classrooms: list[Classroom],
) -> list[SessionResponse]:
    names = {c.id: c.name for c in classrooms}
    return [s.model_copy(update={"classroom_name": names.get(s.classroom_id)}) for s in sessions]


def _past_sessions_with_classroom_names(
    rows: list[ClassroomSession],
    classrooms: list[Classroom],
) -> list[SessionResponse]:
    names = {c.id: c.name for c in classrooms}
    return [
        SessionResponse.model_validate(r).model_copy(update={"classroom_name": names.get(r.classroom_id)})
        for r in rows
    ]


def _normalize_messaging_scope(raw: str | None) -> str:
    s = (raw or "").strip()
    return s if s in _GUARDIAN_MESSAGING_SCOPES else "classmates"


class StudentService:
    """Service layer for student operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = StudentRepository(session)

    async def create_student(
        self,
        data: StudentCreate,
        tenant_id: UUID,
        created_by: UUID | None,
    ) -> Student:
        if data.username and await self.repo.username_exists_in_tenant(
            data.username, tenant_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{data.username}' already exists in this tenant",
            )
        student = Student(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            password_hash=hash_password(data.password),
            display_name=data.display_name,
            date_of_birth=data.date_of_birth,
            global_account=False,
            is_active=True,
            created_by=created_by,
        )
        student = await self.repo.create(student)
        membership = StudentMembership(
            student_id=student.id,
            tenant_id=tenant_id,
            username=data.username,
            grade_level=data.grade_level,
            role="student",
            is_active=True,
            enrolled_by=created_by,
        )
        await self.repo.create_membership(membership)
        logger.info("Student created id=%s", student.id)
        return student

    async def self_register(
        self,
        data: StudentSelfRegister,
        tenant: Tenant,
    ) -> Student:
        if await self.repo.username_exists_in_tenant(data.username, tenant.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{data.username}' already exists in this tenant",
            )
        student = Student(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            password_hash=hash_password(data.password),
            display_name=data.display_name,
            date_of_birth=data.date_of_birth,
            global_account=False,
            is_active=True,
            created_by=None,
        )
        student = await self.repo.create(student)
        membership = StudentMembership(
            student_id=student.id,
            tenant_id=tenant.id,
            username=data.username,
            grade_level=data.grade_level,
            role="student",
            is_active=True,
            enrolled_by=None,
        )
        await self.repo.create_membership(membership)
        logger.info("Student created id=%s", student.id)
        return student

    async def get_student(self, student_id: UUID, tenant_id: UUID) -> Student:
        student = await self.repo.get_by_id(student_id)
        if not student:
            logger.warning("Student not found id=%s", student_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found",
            )
        membership = await self.repo.get_membership(student_id, tenant_id)
        if not membership:
            logger.warning("Student not found in tenant student=%s tenant=%s", student_id, tenant_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found in this tenant",
            )
        return student

    async def update_student(
        self,
        student_id: UUID,
        tenant_id: UUID,
        data: StudentUpdate,
        identity: "CurrentIdentity | None" = None,
    ) -> Student:
        student = await self.get_student(student_id, tenant_id)
        update_data = data.model_dump(exclude_unset=True)

        is_privileged = identity and (
            identity.role in ("owner", "admin") or identity.is_super_admin
        )
        admin_only_fields = {"is_active", "email"}
        if not is_privileged:
            stripped = admin_only_fields & update_data.keys()
            if stripped:
                logger.warning(
                    "Non-admin field(s) stripped from student update: %s caller=%s student=%s",
                    stripped, identity.id if identity else "unknown", student_id,
                )
            for f in admin_only_fields:
                update_data.pop(f, None)

        for key, value in update_data.items():
            setattr(student, key, value)
        if "is_active" in update_data and update_data["is_active"] is False:
            logger.info("Student deactivated id=%s by=%s", student_id, identity.id if identity else "unknown")
        await self.session.flush()
        await self.session.refresh(student)
        return student

    async def enroll_student(
        self,
        student_id: UUID,
        target_tenant_id: UUID,
        data: StudentMembershipCreate,
        enrolled_by: UUID,
    ) -> StudentMembership:
        student = await self.repo.get_by_id(student_id)
        if not student:
            logger.warning("Student not found id=%s", student_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found",
            )
        existing = await self.repo.get_membership(student_id, target_tenant_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student already enrolled in this tenant",
            )
        username = data.username
        if username and await self.repo.username_exists_in_tenant(
            username, target_tenant_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{username}' already exists in target tenant",
            )
        membership = StudentMembership(
            student_id=student_id,
            tenant_id=target_tenant_id,
            username=username,
            grade_level=data.grade_level,
            role=data.role,
            is_active=True,
            enrolled_by=enrolled_by,
        )
        result = await self.repo.create_membership(membership)
        logger.info("Student enrolled student=%s tenant=%s", student_id, target_tenant_id)
        return result

    async def link_students(
        self,
        source_student_id: UUID,
        target_student_id: UUID,
        tenant_id: UUID,
    ) -> Student:
        source = await self.get_student(source_student_id, tenant_id)
        target = await self.repo.get_by_id(target_student_id)
        if not target:
            logger.warning("Target student not found id=%s", target_student_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target student not found",
            )
        target_membership = await self.repo.get_membership(target_student_id, tenant_id)
        if not target_membership:
            logger.warning("Target student not in tenant student=%s tenant=%s", target_student_id, tenant_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target student not in this tenant",
            )
        source_memberships = await self.repo.list_memberships(source_student_id)
        for m in source_memberships:
            existing = await self.repo.get_membership(target_student_id, m.tenant_id)
            if existing:
                await self.session.delete(m)
            else:
                m.student_id = target_student_id
        source_parents = await self.repo.list_parents(source_student_id)
        for p in source_parents:
            existing = await self.repo.get_parent_link(p.user_id, target_student_id)
            if existing:
                await self.session.delete(p)
            else:
                p.student_id = target_student_id
        await self.session.delete(source)
        await self.session.flush()
        await self.session.refresh(target)
        return target

    async def link_parent(
        self,
        student_id: UUID,
        data: ParentLinkRequest,
        tenant_id: UUID,
    ) -> ParentStudent:
        await self.get_student(student_id, tenant_id)
        existing = await self.repo.get_parent_link(data.user_id, student_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Parent already linked to this student",
            )
        link = ParentStudent(
            user_id=data.user_id,
            student_id=student_id,
            relationship=data.relationship,
            is_primary_contact=data.is_primary_contact,
        )
        return await self.repo.create_parent_link(link)

    async def reset_password(
        self,
        student_id: UUID,
        tenant_id: UUID,
        data: ResetPasswordRequest,
    ) -> None:
        student = await self.get_student(student_id, tenant_id)
        student.password_hash = hash_password(data.new_password)
        await self.session.flush()

    async def check_username(self, username: str, tenant_id: UUID) -> bool:
        return not await self.repo.username_exists_in_tenant(username, tenant_id)

    async def resolve_tenant_from_identifier(self, identifier: str) -> Tenant | None:
        """Resolve active tenant by UUID, slug, or code."""
        try:
            tenant_uuid = UUID(identifier)
            return await self.repo.get_active_tenant_by_id(tenant_uuid)
        except ValueError:
            pass
        tenant = await self.repo.get_active_tenant_by_slug(identifier)
        if tenant:
            return tenant
        return await self.repo.get_active_tenant_by_code(identifier)

    async def list_my_upcoming_sessions(
        self, *, student_id: UUID, tenant_id: UUID, limit: int
    ) -> list[SessionResponse]:
        now = datetime.now(timezone.utc)
        db_cap = min(max(limit * _UPCOMING_DB_FETCH_FACTOR, limit), _UPCOMING_DB_FETCH_CAP)
        db_rows = await self.repo.list_upcoming_sessions_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
            now=now,
            limit=db_cap,
        )
        classrooms = await self.repo.list_classrooms_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
        )
        merged = merge_db_and_scheduled_upcoming(
            db_rows, classrooms, now=now, limit=limit
        )
        return _sessions_with_classroom_names(merged, classrooms)

    async def list_my_active_sessions(
        self, *, student_id: UUID, tenant_id: UUID, limit: int
    ) -> list[ClassroomSession]:
        now = datetime.now(timezone.utc)
        return await self.repo.list_active_sessions_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
            now=now,
            limit=limit,
        )

    async def list_my_classrooms(self, *, student_id: UUID, tenant_id: UUID) -> list[Classroom]:
        return await self.repo.list_classrooms_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
        )

    async def list_guardian_linked_classrooms(
        self,
        *,
        guardian_user_id: UUID,
        tenant_id: UUID,
        role_slug: str,
    ) -> list[Classroom]:
        students = await self.list_guardian_children(
            guardian_user_id=guardian_user_id,
            tenant_id=tenant_id,
            role_slug=role_slug,
        )
        return await self.repo.list_classrooms_for_student_ids(
            [s.id for s in students],
            tenant_id,
        )

    async def get_my_classroom(
        self, *, classroom_id: UUID, student_id: UUID, tenant_id: UUID
    ) -> Classroom:
        classroom = await self.repo.get_classroom_for_student(
            classroom_id=classroom_id,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        if not classroom:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
        return classroom

    async def list_my_classroom_sessions(
        self, *, classroom_id: UUID, student_id: UUID, tenant_id: UUID, limit: int
    ) -> list[ClassroomSession]:
        await self.get_my_classroom(
            classroom_id=classroom_id,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        return await self.repo.list_classroom_sessions_for_student(
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            limit=limit,
        )

    async def ensure_student_session_access(
        self, *, classroom_id: UUID, session_id: UUID, student_id: UUID, tenant_id: UUID
    ) -> ClassroomSession:
        await self.get_my_classroom(
            classroom_id=classroom_id,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        session_obj = await self.repo.get_session_for_student_classroom(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        if session_obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return session_obj

    async def list_guardian_children(
        self, *, guardian_user_id: UUID, tenant_id: UUID, role_slug: str
    ) -> list[Student]:
        role = (role_slug or "").strip().lower()
        if role == "homeschool_parent":
            return await self.repo.list_by_tenant(
                tenant_id, skip=0, limit=200, is_active=True
            )
        if role == "parent":
            return await self.repo.list_students_for_parent_user(
                parent_user_id=guardian_user_id, tenant_id=tenant_id
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parent or homeschool parent may list linked children",
        )

    async def list_parent_children_upcoming_sessions(
        self,
        *,
        parent_user_id: UUID,
        tenant_id: UUID,
        limit: int,
        guardian_role_slug: str | None = None,
        student_id: UUID | None = None,
        session_start_before: datetime | None = None,
        expand_month_sessions: bool = False,
    ) -> list[SessionResponse]:
        now = datetime.now(timezone.utc)
        month_aggregate = session_start_before is not None and expand_month_sessions
        if month_aggregate:
            merge_limit = _UPCOMING_MONTH_AGGREGATE_MERGE_CAP
            db_cap = _UPCOMING_MONTH_AGGREGATE_DB_CAP
        else:
            merge_limit = limit
            db_cap = min(max(limit * _UPCOMING_DB_FETCH_FACTOR, limit), _UPCOMING_DB_FETCH_CAP)
        role = (guardian_role_slug or "").strip().lower()
        if student_id is not None:
            db_rows = await self.repo.list_upcoming_sessions_for_student(
                student_id,
                tenant_id,
                now,
                db_cap,
                session_start_before=session_start_before,
            )
            classrooms = await self.repo.list_classrooms_for_student(
                student_id, tenant_id,
            )
            merged = merge_db_and_scheduled_upcoming(
                db_rows,
                classrooms,
                now=now,
                limit=merge_limit,
                session_start_before=session_start_before,
            )
            out = _sessions_with_classroom_names(merged, classrooms)
            if month_aggregate:
                return out
            return out[:limit]
        if role == "homeschool_parent":
            students = await self.repo.list_by_tenant(
                tenant_id, skip=0, limit=500, is_active=True
            )
            ids = [s.id for s in students]
            db_rows = await self.repo.list_upcoming_sessions_for_student_ids(
                student_ids=ids,
                tenant_id=tenant_id,
                now=now,
                limit=db_cap,
                session_start_before=session_start_before,
            )
            classrooms = await self.repo.list_classrooms_for_student_ids(ids, tenant_id)
            merged = merge_db_and_scheduled_upcoming(
                db_rows,
                classrooms,
                now=now,
                limit=merge_limit,
                session_start_before=session_start_before,
            )
            out = _sessions_with_classroom_names(merged, classrooms)
            if month_aggregate:
                return out
            return out[:limit]
        db_rows = await self.repo.list_upcoming_sessions_for_parent_children(
            parent_user_id=parent_user_id,
            tenant_id=tenant_id,
            now=now,
            limit=db_cap,
            session_start_before=session_start_before,
        )
        children = await self.repo.list_students_for_parent_user(
            parent_user_id=parent_user_id,
            tenant_id=tenant_id,
        )
        classrooms = await self.repo.list_classrooms_for_student_ids(
            [c.id for c in children],
            tenant_id,
        )
        merged = merge_db_and_scheduled_upcoming(
            db_rows,
            classrooms,
            now=now,
            limit=merge_limit,
            session_start_before=session_start_before,
        )
        out = _sessions_with_classroom_names(merged, classrooms)
        if month_aggregate:
            return out
        return out[:limit]

    async def list_parent_children_past_sessions(
        self,
        *,
        parent_user_id: UUID,
        tenant_id: UUID,
        limit: int,
        guardian_role_slug: str | None = None,
        student_id: UUID | None = None,
    ) -> list[SessionResponse]:
        now = datetime.now(timezone.utc)
        role = (guardian_role_slug or "").strip().lower()
        if student_id is not None:
            rows = await self.repo.list_past_sessions_for_student(
                student_id, tenant_id, now, limit
            )
            classrooms = await self.repo.list_classrooms_for_student(
                student_id, tenant_id,
            )
            return _past_sessions_with_classroom_names(rows, classrooms)
        if role == "homeschool_parent":
            students = await self.repo.list_by_tenant(
                tenant_id, skip=0, limit=500, is_active=True
            )
            ids = [s.id for s in students]
            rows = await self.repo.list_past_sessions_for_student_ids(
                student_ids=ids,
                tenant_id=tenant_id,
                now=now,
                limit=limit,
            )
            classrooms = await self.repo.list_classrooms_for_student_ids(ids, tenant_id)
            return _past_sessions_with_classroom_names(rows, classrooms)
        rows = await self.repo.list_past_sessions_for_parent_children(
            parent_user_id=parent_user_id,
            tenant_id=tenant_id,
            now=now,
            limit=limit,
        )
        children = await self.repo.list_students_for_parent_user(
            parent_user_id=parent_user_id,
            tenant_id=tenant_id,
        )
        classrooms = await self.repo.list_classrooms_for_student_ids(
            [c.id for c in children],
            tenant_id,
        )
        return _past_sessions_with_classroom_names(rows, classrooms)

    async def list_my_assignments(
        self, *, student_id: UUID, tenant_id: UUID, limit: int
    ) -> list[dict]:
        from uuid import UUID as _UUID

        rows = await self.repo.list_assignments_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
            limit=max(1, min(limit, 300)),
        )

        session_ids = [session.id for _, session, _ in rows]
        submission_events = await self.repo.list_submission_events_for_student(
            student_id=student_id,
            tenant_id=tenant_id,
            session_ids=session_ids,
        )
        # Build a map: session_id -> {assignment_id -> latest event_type}
        submission_map: dict[str, dict[str, str]] = {}
        for ev in submission_events:
            sid = str(ev.session_id)
            aid = str((ev.metadata_ or {}).get("assignment_id") or "")
            # "submitted" beats "saved"
            current = submission_map.setdefault(sid, {}).get(aid)
            if current != "student.submission.submitted":
                submission_map[sid][aid] = ev.event_type

        assignments: list[dict] = []
        for state, session, classroom in rows:
            for raw_assignment in state.assignments or []:
                if not isinstance(raw_assignment, dict):
                    continue
                assignment_id = raw_assignment.get("id")
                if assignment_id is None:
                    continue
                sid = str(session.id)
                aid = str(assignment_id)
                raw_ev = submission_map.get(sid, {}).get(aid)
                if raw_ev == "student.submission.submitted":
                    sub_status = "submitted"
                elif raw_ev == "student.submission.saved":
                    sub_status = "draft"
                else:
                    sub_status = None
                assignments.append(
                    {
                        "id": aid,
                        "title": str(raw_assignment.get("title") or "Assignment"),
                        "description": str(raw_assignment.get("description") or ""),
                        "instructions": raw_assignment.get("instructions") or None,
                        "due_at": raw_assignment.get("due_at"),
                        "lab_id": raw_assignment.get("lab_id") or None,
                        "classroom_id": str(classroom.id),
                        "classroom_name": classroom.name,
                        "session_id": sid,
                        "session_start": session.session_start.isoformat(),
                        "session_end": session.session_end.isoformat(),
                        "session_status": session.status,
                        "submission_status": sub_status,
                    }
                )
        assignments.sort(
            key=lambda item: (
                item.get("due_at") is None,
                str(item.get("due_at") or ""),
            )
        )
        return assignments

    async def get_guardian_child_controls(
        self,
        student_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
    ) -> GuardianChildControlsResponse:
        await ensure_can_view_student_as_guardian(
            self.session,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        mem = await self.repo.get_membership(student_id, tenant_id)
        grade = mem.grade_level if mem else None
        link = await self.repo.get_parent_link(identity.id, student_id)
        if link:
            scope = _normalize_messaging_scope(link.messaging_scope)
            pub = bool(link.allow_public_game_publishing)
            has_link = True
        else:
            scope = "classmates"
            pub = True
            has_link = False
        return GuardianChildControlsResponse(
            student_id=student_id,
            messaging_scope=scope,  # type: ignore[arg-type]
            allow_public_game_publishing=pub,
            grade_level=grade,
            has_parent_link=has_link,
        )

    async def patch_guardian_child_controls(
        self,
        student_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        data: GuardianChildControlsPatch,
    ) -> GuardianChildControlsResponse:
        if (
            data.messaging_scope is None
            and data.allow_public_game_publishing is None
            and data.grade_level is None
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update",
            )
        await ensure_can_view_student_as_guardian(
            self.session,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        role = (identity.role or "").strip().lower()
        link = await self.repo.get_parent_link(identity.id, student_id)

        if data.messaging_scope is not None or data.allow_public_game_publishing is not None:
            if link is None:
                if role != "homeschool_parent":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No guardian link exists for this learner. Ask your school to adjust settings.",
                    )
                link = ParentStudent(
                    user_id=identity.id,
                    student_id=student_id,
                    relationship="guardian",
                    is_primary_contact=False,
                )
                self.session.add(link)
                await self.session.flush()
            if data.messaging_scope is not None:
                link.messaging_scope = data.messaging_scope
            if data.allow_public_game_publishing is not None:
                link.allow_public_game_publishing = data.allow_public_game_publishing

        if data.grade_level is not None:
            mem = await self.repo.get_membership(student_id, tenant_id)
            if mem is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Student not found in this workspace",
                )
            mem.grade_level = data.grade_level or None

        await self.session.commit()
        return await self.get_guardian_child_controls(student_id, tenant_id, identity)

    async def unlink_guardian_from_student(
        self,
        student_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
    ) -> None:
        await ensure_can_view_student_as_guardian(
            self.session,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        role = (identity.role or "").strip().lower()
        deleted = await self.repo.delete_parent_link(identity.id, student_id)
        if not deleted:
            if role == "homeschool_parent":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "There is no guardian link to remove. To remove this learner from your "
                        "organization, use the Students page (workspace admin)."
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Guardian link not found",
            )
        await self.session.commit()
