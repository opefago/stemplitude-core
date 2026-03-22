"""Classroom service."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom, ClassroomSession, ClassroomStudent
from app.curriculum.models import Course
from app.dependencies import CurrentIdentity
from app.notifications.models import Notification
from app.progress.models import Attendance
from app.students.models import ParentStudent, Student
from app.users.models import User
from app.tenants.repository import MembershipRepository
from app.realtime.gateway import publish_channel_message
from app.realtime.user_events import publish_notifications_changed, publish_sessions_changed

from .repository import ClassroomRepository
from .schemas import (
    AttendanceResponse,
    ClassroomCreate,
    ClassroomRosterStudentResponse,
    ClassroomResponse,
    ClassroomStudentResponse,
    ClassroomUpdate,
    CreateSessionRequest,
    EndSessionRequest,
    EnrollStudentRequest,
    RecordAttendanceRequest,
    RegenerateMeetingRequest,
    RegenerateMeetingResponse,
    RescheduleSessionRequest,
    SessionEditRequest,
    SessionPresenceHeartbeatRequest,
    SessionPresenceParticipantResponse,
    SessionPresenceSummaryResponse,
    SessionActivityCreateRequest,
    SessionChatCreateRequest,
    SessionContentUpdateRequest,
    SessionEventResponse,
    SessionStateResponse,
    RealtimeEventEnvelope,
    RealtimeSessionSnapshotResponse,
    SessionResponse,
)

logger = logging.getLogger(__name__)

PRESENCE_ACTIVE_WINDOW = timedelta(seconds=45)
SESSION_IDLE_TIMEOUT = timedelta(minutes=15)
LIVE_SYNC_STATE_KEY = "live_sync"


class ClassroomService:
    """Classroom business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ClassroomRepository(session)

    async def _session_recipient_principal_ids(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
    ) -> list[UUID]:
        """User-channel recipients: enrolled students + classroom instructor."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            return []
        enrolled = await self.repo.list_enrolled_students(classroom_id)
        ids: list[UUID] = [student.id for _, student in enrolled]
        if classroom.instructor_id:
            ids.append(classroom.instructor_id)
        seen: set[UUID] = set()
        out: list[UUID] = []
        for i in ids:
            if i not in seen:
                seen.add(i)
                out.append(i)
        return out

    async def _notify_sessions_changed_for_classroom(
        self,
        *,
        tenant_id: UUID,
        classroom_id: UUID,
        session_id: UUID | None = None,
        reason: str = "sessions.changed",
    ) -> None:
        recipient_ids = await self._session_recipient_principal_ids(classroom_id, tenant_id)
        if not recipient_ids:
            return
        try:
            await publish_sessions_changed(
                tenant_id,
                recipient_ids,
                classroom_id=classroom_id,
                session_id=session_id,
                reason=reason,
            )
        except Exception:
            logger.exception(
                "Failed to publish sessions.changed realtime for classroom=%s",
                classroom_id,
            )

    async def _notify_classroom_enrollment_change(
        self,
        *,
        classroom_id: UUID,
        student_id: UUID,
        tenant_id: UUID,
        added: bool,
    ) -> None:
        """Notify student (in-app), parents (in-app), and send enrollment emails when addresses exist."""
        from app.notifications.dispatch import persist_classroom_enrollment_notifications

        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        student = await self.session.get(Student, student_id)
        if not classroom or not student:
            return
        result = await self.session.execute(
            select(ParentStudent).where(ParentStudent.student_id == student_id)
        )
        parent_links = list(result.scalars().all())
        parent_user_ids = [link.user_id for link in parent_links]
        parent_emails: list[str | None] = []
        for uid in parent_user_ids:
            u = await self.session.get(User, uid)
            parent_emails.append(u.email if u else None)

        await persist_classroom_enrollment_notifications(
            self.session,
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            classroom_name=classroom.name or "Class",
            student_id=student_id,
            student_first_name=(student.first_name or "").strip(),
            student_email=student.email,
            parent_user_ids=parent_user_ids,
            parent_emails=parent_emails,
            added=added,
        )

    @staticmethod
    def _presence_actor_type(identity: CurrentIdentity) -> str:
        """Map identity to presence actor type."""
        if identity.sub_type == "student":
            return "student"
        if identity.role in {"admin", "owner", "instructor"}:
            return "instructor"
        return "user"

    @staticmethod
    def _parse_session_notes(notes: str | None) -> tuple[str | None, dict]:
        """Extract human notes and stored session content refs from notes payload."""
        empty_content: dict = {
            "shared_asset_ids": [],
            "downloadable_asset_ids": [],
            "text_assignments": [],
            "resource_entries": [],
        }
        if not notes:
            return None, empty_content
        try:
            raw = json.loads(notes)
        except Exception:
            return notes, empty_content
        if not isinstance(raw, dict) or raw.get("__kind") != "session_notes_v1":
            return notes, empty_content
        content_raw = raw.get("content") or {}
        if not isinstance(content_raw, dict):
            content_raw = {}
        shared = [str(x) for x in (content_raw.get("shared_asset_ids") or []) if x]
        downloadable = [
            str(x) for x in (content_raw.get("downloadable_asset_ids") or []) if x
        ]
        text_assignments = content_raw.get("text_assignments") or []
        if not isinstance(text_assignments, list):
            text_assignments = []
        resource_entries = content_raw.get("resource_entries") or []
        if not isinstance(resource_entries, list):
            resource_entries = []
        return raw.get("text"), {
            "shared_asset_ids": shared,
            "downloadable_asset_ids": downloadable,
            "text_assignments": text_assignments,
            "resource_entries": resource_entries,
        }

    @staticmethod
    def _serialize_session_notes(
        *,
        note_text: str | None,
        shared_asset_ids: list[str],
        downloadable_asset_ids: list[str],
        text_assignments: list[dict] | None = None,
        resource_entries: list[dict] | None = None,
    ) -> str:
        payload = {
            "__kind": "session_notes_v1",
            "text": note_text or "",
            "content": {
                "shared_asset_ids": shared_asset_ids,
                "downloadable_asset_ids": downloadable_asset_ids,
                "text_assignments": text_assignments or [],
                "resource_entries": resource_entries or [],
            },
        }
        return json.dumps(payload)

    def _session_to_response(self, session_obj: ClassroomSession) -> SessionResponse:
        note_text, content = self._parse_session_notes(session_obj.notes)
        base = SessionResponse.model_validate(session_obj)
        return base.model_copy(update={"notes": note_text, "session_content": content})

    async def _resolve_user_name(self, user_id: UUID) -> str:
        user = await self.session.get(User, user_id)
        if not user:
            return "User"
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.email or "User"

    async def _resolve_student_name(self, student_id: UUID | None) -> str | None:
        if not student_id:
            return None
        student = await self.session.get(Student, student_id)
        if not student:
            return None
        return student.display_name or f"{student.first_name} {student.last_name}".strip() or student.email

    async def _resolve_actor_display_name(self, identity: CurrentIdentity) -> str:
        if identity.sub_type == "student":
            return await self._resolve_student_name(identity.id) or "Student"
        return await self._resolve_user_name(identity.id)

    async def _event_to_response(self, event) -> SessionEventResponse:
        actor_display_name = "Participant"
        if event.actor_type == "student":
            actor_display_name = await self._resolve_student_name(event.actor_id) or "Student"
        else:
            actor_display_name = await self._resolve_user_name(event.actor_id)
        student_display_name = await self._resolve_student_name(event.student_id)
        return SessionEventResponse(
            id=event.id,
            session_id=event.session_id,
            classroom_id=event.classroom_id,
            tenant_id=event.tenant_id,
            event_type=event.event_type,
            sequence=event.sequence,
            correlation_id=event.correlation_id,
            actor_id=event.actor_id,
            actor_type=event.actor_type,
            actor_display_name=actor_display_name,
            student_id=event.student_id,
            student_display_name=student_display_name,
            message=event.message,
            points_delta=event.points_delta,
            metadata=event.metadata_ or {},
            created_at=event.created_at,
        )

    def _session_state_to_response(self, state_row, *, session_obj: ClassroomSession) -> SessionStateResponse:
        return SessionStateResponse(
            session_id=session_obj.id,
            classroom_id=session_obj.classroom_id,
            tenant_id=session_obj.tenant_id,
            active_lab=(state_row.active_lab if state_row else None),
            assignments=(list(state_row.assignments or []) if state_row else []),
            metadata=(dict(state_row.metadata_ or {}) if state_row else {}),
            updated_at=(state_row.updated_at if state_row else None),
        )

    async def _event_to_envelope(self, event) -> RealtimeEventEnvelope:
        actor = {
            "id": str(event.actor_id),
            "type": event.actor_type,
            "display_name": await self._resolve_student_name(event.actor_id)
            if event.actor_type == "student"
            else await self._resolve_user_name(event.actor_id),
        }
        payload: dict = {}
        if event.message:
            payload["message"] = event.message
        if event.points_delta is not None:
            payload["points_delta"] = event.points_delta
        if event.student_id:
            payload["student_id"] = str(event.student_id)
            payload["student_display_name"] = await self._resolve_student_name(event.student_id)
        if event.metadata_:
            # Generic realtime commands store their data in metadata_.
            # Flatten dict payloads into envelope.payload so clients can consume
            # fields directly (e.g. payload.view, payload.resource_id).
            if isinstance(event.metadata_, dict):
                payload.update(event.metadata_)
            payload["metadata"] = event.metadata_
        return RealtimeEventEnvelope(
            event_id=event.id,
            session_id=event.session_id,
            classroom_id=event.classroom_id,
            tenant_id=event.tenant_id,
            event_type=event.event_type,
            sequence=event.sequence,
            occurred_at=event.created_at,
            correlation_id=event.correlation_id,
            actor=actor,
            payload=payload,
        )

    async def _ensure_session_exists(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
    ) -> ClassroomSession:
        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if not session_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        return session_obj

    async def _build_presence_summary(
        self,
        *,
        session_obj: ClassroomSession,
        now: datetime,
    ) -> SessionPresenceSummaryResponse:
        summary = await self.repo.get_session_presence_summary(
            session_id=session_obj.id,
            active_after=now - PRESENCE_ACTIVE_WINDOW,
        )
        latest_seen_at = summary["latest_seen_at"]
        latest_seen_anchor = latest_seen_at or session_obj.session_start
        auto_end_due_at = latest_seen_anchor + SESSION_IDLE_TIMEOUT
        return SessionPresenceSummaryResponse(
            session_id=session_obj.id,
            active_students=int(summary["active_students"]),
            active_instructors=int(summary["active_instructors"]),
            active_users=int(summary["active_users"]),
            active_total=int(summary["active_total"]),
            latest_seen_at=latest_seen_at,
            auto_end_due_at=auto_end_due_at,
        )

    async def _auto_complete_if_idle(
        self,
        *,
        session_obj: ClassroomSession,
        now: datetime,
    ) -> bool:
        """Auto-complete active sessions when everyone has been gone for too long."""
        if session_obj.status in {"canceled", "completed"}:
            return False
        if session_obj.session_start > now:
            return False

        summary = await self.repo.get_session_presence_summary(
            session_id=session_obj.id,
            active_after=now - PRESENCE_ACTIVE_WINDOW,
        )
        if int(summary["active_total"]) > 0:
            return False

        latest_seen_at = summary["latest_seen_at"] or session_obj.session_start
        if now - latest_seen_at < SESSION_IDLE_TIMEOUT:
            return False

        session_obj.status = "completed"
        if session_obj.session_end > now:
            session_obj.session_end = now
        await self._clear_session_live_sync_state(
            classroom_id=session_obj.classroom_id,
            session_id=session_obj.id,
            tenant_id=session_obj.tenant_id,
        )
        await self.session.flush()
        await self._notify_sessions_changed_for_classroom(
            tenant_id=session_obj.tenant_id,
            classroom_id=session_obj.classroom_id,
            session_id=session_obj.id,
            reason="session.auto_completed",
        )
        return True

    async def _clear_session_live_sync_state(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
    ) -> None:
        state_row = await self.repo.get_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        if not state_row:
            return
        metadata = dict(state_row.metadata_ or {})
        if LIVE_SYNC_STATE_KEY not in metadata:
            return
        metadata.pop(LIVE_SYNC_STATE_KEY, None)
        await self.repo.update_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            metadata_=metadata,
        )

    async def _persist_live_sync_patch(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        event_type: str,
        payload: dict | None,
    ) -> None:
        patch: dict[str, object] = {}
        body = payload or {}
        if event_type == "session.view.changed":
            view = body.get("view")
            if view in {"shared", "lab"}:
                patch["view"] = view
        elif event_type == "session.content.selected":
            resource_id = body.get("resource_id")
            if isinstance(resource_id, str) and resource_id:
                patch["selected_resource_id"] = resource_id
                patch["view"] = "shared"
            page = body.get("page")
            if isinstance(page, int) and page >= 1:
                patch["page"] = page
        elif event_type == "session.page.changed":
            page = body.get("page")
            if isinstance(page, int) and page >= 1:
                patch["page"] = page
        elif event_type == "session.media.control":
            action = body.get("action")
            at = body.get("at")
            if action in {"play", "pause"}:
                media_state: dict[str, object] = {"action": action}
                if isinstance(at, (int, float)) and at >= 0:
                    media_state["at"] = float(at)
                patch["media"] = media_state
        elif event_type == "session.content.updated":
            selected_resource_id = body.get("selected_resource_id")
            if isinstance(selected_resource_id, str) and selected_resource_id:
                patch["selected_resource_id"] = selected_resource_id
        elif event_type == "session.scroll.changed":
            x = body.get("x")
            y = body.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                patch["scroll"] = {"x": float(x), "y": float(y)}

        if not patch:
            return

        state_row = await self.repo.get_or_create_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        metadata = dict(state_row.metadata_ or {})
        live_sync = dict(metadata.get(LIVE_SYNC_STATE_KEY) or {})
        live_sync.update(patch)
        live_sync["updated_at"] = datetime.now(timezone.utc).isoformat()
        metadata[LIVE_SYNC_STATE_KEY] = live_sync
        await self.repo.update_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            metadata_=metadata,
        )

    async def create(self, data: ClassroomCreate, tenant_id: UUID) -> ClassroomResponse:
        """Create a classroom with generated join_code."""
        join_code = await self.repo.generate_unique_join_code()
        classroom = Classroom(
            tenant_id=tenant_id,
            name=data.name,
            program_id=data.program_id,
            curriculum_id=data.curriculum_id,
            instructor_id=data.instructor_id,
            mode=data.mode,
            recurrence_type=data.recurrence_type,
            meeting_provider=data.meeting_provider,
            meeting_link=data.meeting_link,
            location_address=data.location_address,
            schedule=data.schedule or {},
            starts_at=data.starts_at,
            ends_at=data.ends_at,
            recurrence_rule=data.recurrence_rule,
            timezone=data.timezone,
            max_students=data.max_students,
            is_active=data.is_active,
            join_code=join_code,
        )
        self.session.add(classroom)
        await self.session.flush()
        await self.session.refresh(classroom)
        logger.info("Classroom created id=%s tenant=%s", classroom.id, tenant_id)

        # Auto-create a group conversation for this classroom
        try:
            from app.messaging.service import ConversationService
            conv_service = ConversationService(self.session)
            await conv_service.create_classroom_conversation(
                classroom_id=classroom.id,
                classroom_name=classroom.name,
                instructor_id=classroom.instructor_id,
                tenant_id=tenant_id,
            )
        except Exception:
            logger.warning("Failed to auto-create conversation for classroom %s", classroom.id, exc_info=True)

        return ClassroomResponse.model_validate(classroom)

    async def list(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
        program_id: UUID | None = None,
        curriculum_id: UUID | None = None,
    ) -> list[ClassroomResponse]:
        """List classrooms for a tenant."""
        rows = await self.repo.list_with_relationship_summaries(
            tenant_id,
            skip=skip,
            limit=limit,
            is_active=is_active,
            program_id=program_id,
            curriculum_id=curriculum_id,
        )
        return [
            ClassroomResponse.model_validate(
                classroom,
            ).model_copy(update={
                "program_name": program_name,
                "curriculum_title": curriculum_title,
                "program_start_date": str(prog_start) if prog_start else None,
                "program_end_date": str(prog_end) if prog_end else None,
            })
            for classroom, program_name, curriculum_title, prog_start, prog_end in rows
        ]

    async def get_by_id(self, classroom_id: UUID, tenant_id: UUID) -> ClassroomResponse:
        """Get classroom by ID."""
        row = await self.repo.get_with_relationship_summary(classroom_id, tenant_id)
        if not row:
            logger.warning("Classroom not found id=%s", classroom_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        classroom, program_name, curriculum_title, prog_start, prog_end = row
        return ClassroomResponse.model_validate(classroom).model_copy(
            update={
                "program_name": program_name,
                "curriculum_title": curriculum_title,
                "program_start_date": str(prog_start) if prog_start else None,
                "program_end_date": str(prog_end) if prog_end else None,
            }
        )

    async def update(
        self,
        classroom_id: UUID,
        data: ClassroomUpdate,
        tenant_id: UUID,
    ) -> ClassroomResponse:
        """Update a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            logger.warning("Classroom not found id=%s", classroom_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        update_data = data.model_dump(exclude_unset=True)

        if "instructor_id" in update_data and update_data["instructor_id"] is not None:
            membership_repo = MembershipRepository(self.session)
            membership = await membership_repo.get_by_user_tenant(
                update_data["instructor_id"], tenant_id
            )
            if not membership:
                logger.warning(
                    "Instructor assignment denied: user=%s not a member of tenant=%s",
                    update_data["instructor_id"], tenant_id,
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Instructor must be a member of this tenant",
                )

        for key, value in update_data.items():
            setattr(classroom, key, value)
        await self.session.flush()
        await self.session.refresh(classroom)
        row = await self.repo.get_with_relationship_summary(classroom.id, tenant_id)
        if row is None:
            return ClassroomResponse.model_validate(classroom)
        classroom, program_name, curriculum_title, prog_start, prog_end = row
        return ClassroomResponse.model_validate(classroom).model_copy(
            update={
                "program_name": program_name,
                "curriculum_title": curriculum_title,
                "program_start_date": str(prog_start) if prog_start else None,
                "program_end_date": str(prog_end) if prog_end else None,
            }
        )

    async def check_duplicate_name(
        self,
        *,
        tenant_id: UUID,
        name: str,
        exclude_classroom_id: UUID | None = None,
    ) -> bool:
        """Check if classroom name already exists within tenant."""
        return await self.repo.class_name_exists(
            tenant_id=tenant_id,
            name=name,
            exclude_classroom_id=exclude_classroom_id,
        )

    async def check_instructor_schedule_conflicts(
        self,
        *,
        tenant_id: UUID,
        instructor_id: UUID,
        selected_days: list[str],
        start_time: str,
        end_time: str,
        exclude_classroom_id: UUID | None = None,
    ) -> list[UUID]:
        """Return conflicting classroom IDs for instructor schedule."""
        return await self.repo.find_instructor_schedule_conflicts(
            tenant_id=tenant_id,
            instructor_id=instructor_id,
            selected_days=selected_days,
            start_time=start_time,
            end_time=end_time,
            exclude_classroom_id=exclude_classroom_id,
        )

    async def bulk_assign_curriculum(
        self,
        *,
        tenant_id: UUID,
        classroom_ids: list[UUID],
        curriculum_id: UUID | None,
    ) -> int:
        """Bulk assign/unassign curriculum to classes with optional program derivation."""
        derived_program_id: UUID | None = None
        if curriculum_id is not None:
            course = await self.session.get(Course, curriculum_id)
            if not course or course.tenant_id != tenant_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum not found")
            derived_program_id = course.program_id
        updated = await self.repo.bulk_assign_curriculum(
            tenant_id=tenant_id,
            classroom_ids=classroom_ids,
            curriculum_id=curriculum_id,
            program_id=derived_program_id,
        )
        await self.session.flush()
        return updated

    async def delete(self, classroom_id: UUID, tenant_id: UUID) -> None:
        """Soft-delete a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            logger.warning("Classroom not found id=%s", classroom_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        classroom.deleted_at = datetime.now(timezone.utc)
        classroom.is_active = False
        await self.session.flush()
        logger.info("Classroom deleted id=%s", classroom_id)

    async def enroll_student(
        self,
        classroom_id: UUID,
        data: EnrollStudentRequest,
        tenant_id: UUID,
    ) -> ClassroomStudentResponse:
        """Enroll a student in a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            logger.warning("Classroom not found id=%s", classroom_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        existing = await self.repo.get_enrollment(classroom_id, data.student_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student already enrolled in this classroom",
            )
        if classroom.max_students:
            enrolled = await self.repo.list_enrolled_students(classroom_id)
            if len(enrolled) >= classroom.max_students:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Classroom is full",
                )
        enrollment = ClassroomStudent(
            classroom_id=classroom_id,
            student_id=data.student_id,
        )
        self.session.add(enrollment)
        await self.session.flush()
        await self.session.refresh(enrollment)
        logger.info("Student added to classroom student=%s classroom=%s", data.student_id, classroom_id)
        try:
            await self._notify_classroom_enrollment_change(
                classroom_id=classroom_id,
                student_id=data.student_id,
                tenant_id=tenant_id,
                added=True,
            )
        except Exception:
            logger.exception("Failed to queue enrollment notifications classroom=%s", classroom_id)
        return ClassroomStudentResponse.model_validate(enrollment)

    async def unenroll_student(
        self,
        classroom_id: UUID,
        student_id: UUID,
        tenant_id: UUID,
    ) -> None:
        """Unenroll a student from a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        enrollment = await self.repo.get_enrollment(classroom_id, student_id)
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not enrolled in this classroom",
            )
        await self.session.delete(enrollment)
        await self.session.flush()
        try:
            await self._notify_classroom_enrollment_change(
                classroom_id=classroom_id,
                student_id=student_id,
                tenant_id=tenant_id,
                added=False,
            )
        except Exception:
            logger.exception("Failed to queue unenrollment notifications classroom=%s", classroom_id)

    async def list_students(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
    ) -> list[ClassroomStudentResponse]:
        """List enrolled students."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        enrolled = await self.repo.list_enrolled_students(classroom_id)
        return [ClassroomStudentResponse.model_validate(e) for e, _ in enrolled]

    async def list_student_roster(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
    ) -> list[ClassroomRosterStudentResponse]:
        """List enrolled students with profile details for classroom live views."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        enrolled = await self.repo.list_enrolled_students(classroom_id)
        return [
            ClassroomRosterStudentResponse(
                id=student.id,
                first_name=student.first_name,
                last_name=student.last_name,
                email=student.email,
                display_name=student.display_name,
                enrolled_at=enrollment.enrolled_at,
            )
            for enrollment, student in enrolled
        ]

    async def record_attendance(
        self,
        classroom_id: UUID,
        data: RecordAttendanceRequest,
        tenant_id: UUID,
    ) -> AttendanceResponse:
        """Record attendance for a student in a session."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        session_obj = await self.repo.get_session_by_id(
            data.session_id, classroom_id, tenant_id
        )
        if not session_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        enrollment = await self.repo.get_enrollment(classroom_id, data.student_id)
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student not enrolled in this classroom",
            )
        existing = await self.repo.get_attendance(data.session_id, data.student_id)
        if existing:
            existing.status = data.status
            existing.notes = data.notes
            await self.session.flush()
            await self.session.refresh(existing)
            return AttendanceResponse.model_validate(existing)
        attendance = Attendance(
            session_id=data.session_id,
            classroom_id=classroom_id,
            student_id=data.student_id,
            tenant_id=tenant_id,
            status=data.status,
            notes=data.notes,
        )
        self.session.add(attendance)
        await self.session.flush()
        await self.session.refresh(attendance)
        return AttendanceResponse.model_validate(attendance)

    async def list_attendance(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
        *,
        session_id: UUID | None = None,
    ) -> list[AttendanceResponse]:
        """List attendance records for a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        records = await self.repo.list_attendance(
            classroom_id, session_id=session_id
        )
        return [AttendanceResponse.model_validate(r) for r in records]

    async def list_sessions(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
        *,
        limit: int = 100,
    ) -> list[SessionResponse]:
        """List sessions for a classroom."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        sessions = await self.repo.list_sessions(classroom_id, tenant_id, limit=limit)
        now = datetime.now(timezone.utc)
        changed = False
        for row in sessions:
            changed = await self._auto_complete_if_idle(session_obj=row, now=now) or changed
        if changed:
            await self.session.flush()
        return [self._session_to_response(s) for s in sessions]

    async def cancel_session(
        self,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        *,
        tenant_settings: dict | None = None,
        caller_role: str | None = None,
    ) -> SessionResponse:
        """Cancel a scheduled session. Enforces parent policies if caller is a parent."""
        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if not session_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        if session_obj.status == "canceled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session is already canceled",
            )
        if caller_role == "parent":
            from datetime import timedelta
            policies = (tenant_settings or {}).get("parent_policies", {})
            if not policies.get("allow_cancel", False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This organization does not allow parents to cancel sessions",
                )
            deadline_hours = policies.get("cancel_deadline_hours", 24)
            if session_obj.session_start < datetime.now(timezone.utc) + timedelta(hours=deadline_hours):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot cancel within {deadline_hours} hours of session start",
                )
        session_obj.status = "canceled"
        session_obj.canceled_at = datetime.now(timezone.utc)
        await self._clear_session_live_sync_state(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        await self.session.flush()
        await self.session.refresh(session_obj)
        logger.info("Session canceled id=%s classroom=%s", session_id, classroom_id)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_id,
            reason="session.canceled",
        )
        return self._session_to_response(session_obj)

    async def reschedule_session(
        self,
        classroom_id: UUID,
        session_id: UUID,
        data: RescheduleSessionRequest,
        tenant_id: UUID,
        *,
        tenant_settings: dict | None = None,
        caller_role: str | None = None,
    ) -> SessionResponse:
        """Reschedule a session to new times. Enforces parent policies if caller is a parent."""
        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if not session_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        if session_obj.status == "canceled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reschedule a canceled session",
            )
        if data.session_start <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New session start must be in the future",
            )
        if data.session_end <= data.session_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session end must be after session start",
            )
        if caller_role == "parent":
            policies = (tenant_settings or {}).get("parent_policies", {})
            if not policies.get("allow_reschedule", False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This organization does not allow parents to reschedule sessions",
                )
        session_obj.session_start = data.session_start
        session_obj.session_end = data.session_end
        session_obj.status = "scheduled"
        await self.session.flush()
        await self.session.refresh(session_obj)
        logger.info("Session rescheduled id=%s classroom=%s", session_id, classroom_id)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_id,
            reason="session.rescheduled",
        )
        return self._session_to_response(session_obj)

    async def create_session(
        self,
        classroom_id: UUID,
        data: CreateSessionRequest,
        tenant_id: UUID,
    ) -> SessionResponse:
        """Create a classroom session."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )
        if data.session_end <= data.session_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session end must be after session start",
            )

        now = datetime.now(timezone.utc)
        existing_active = await self.repo.find_active_session(classroom_id, tenant_id, now=now)
        if existing_active:
            await self._auto_complete_if_idle(session_obj=existing_active, now=now)
            if existing_active.status != "completed":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An active session already exists for this classroom",
                )

        starts_now_or_past = data.session_start <= now
        session_status = "active" if starts_now_or_past else "scheduled"
        session_obj = ClassroomSession(
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            session_start=data.session_start,
            session_end=data.session_end,
            status=session_status,
            meeting_link=data.meeting_link or classroom.meeting_link,
            notes=data.notes,
        )
        self.session.add(session_obj)
        await self.session.flush()
        await self.session.refresh(session_obj)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_obj.id,
            reason="session.created",
        )
        return self._session_to_response(session_obj)

    async def heartbeat_session_presence(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        data: SessionPresenceHeartbeatRequest,
    ) -> SessionPresenceSummaryResponse:
        """Track participant presence while in a live session."""
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        if data.status not in {"active", "left"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Presence status must be 'active' or 'left'",
            )
        now = datetime.now(timezone.utc)
        await self._auto_complete_if_idle(session_obj=session_obj, now=now)
        if session_obj.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session has already ended",
            )

        actor_type = self._presence_actor_type(identity)
        became_active = False
        if data.status == "left":
            await self.repo.mark_presence_left(
                session_id=session_obj.id,
                actor_id=identity.id,
                actor_type=actor_type,
                left_at=now,
            )
        else:
            await self.repo.upsert_presence(
                session_id=session_obj.id,
                classroom_id=classroom_id,
                tenant_id=tenant_id,
                actor_id=identity.id,
                actor_type=actor_type,
                seen_at=now,
            )
            if session_obj.status == "scheduled" and session_obj.session_start <= now <= session_obj.session_end:
                session_obj.status = "active"
                became_active = True

        await self.session.flush()
        if became_active:
            await self._notify_sessions_changed_for_classroom(
                tenant_id=tenant_id,
                classroom_id=classroom_id,
                session_id=session_obj.id,
                reason="session.became_active",
            )
        return await self._build_presence_summary(session_obj=session_obj, now=now)

    async def get_session_presence_summary(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
    ) -> SessionPresenceSummaryResponse:
        """Return current presence summary for a classroom session."""
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        now = datetime.now(timezone.utc)
        changed = await self._auto_complete_if_idle(session_obj=session_obj, now=now)
        if changed:
            await self.session.flush()
        return await self._build_presence_summary(session_obj=session_obj, now=now)

    async def get_session_presence_participants(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
    ) -> list[SessionPresenceParticipantResponse]:
        """Return active participants currently in a session."""
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        now = datetime.now(timezone.utc)
        changed = await self._auto_complete_if_idle(session_obj=session_obj, now=now)
        if changed:
            await self.session.flush()
            return []
        rows = await self.repo.list_active_session_participants(
            session_id=session_obj.id,
            active_after=now - PRESENCE_ACTIVE_WINDOW,
        )
        return [SessionPresenceParticipantResponse(**row) for row in rows]

    async def end_session(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        data: EndSessionRequest,
        identity: CurrentIdentity,
    ) -> SessionResponse:
        """End an active session, requiring explicit force when students are present."""
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        now = datetime.now(timezone.utc)
        if session_obj.status in {"canceled", "completed"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session has already ended",
            )

        summary = await self.repo.get_session_presence_summary(
            session_id=session_obj.id,
            active_after=now - PRESENCE_ACTIVE_WINDOW,
        )
        active_students = int(summary["active_students"])
        if active_students > 0 and not data.force_end_for_all:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{active_students} student(s) are still active. Confirm end for all participants.",
            )

        session_obj.status = "completed"
        if session_obj.session_end > now:
            session_obj.session_end = now
        await self._clear_session_live_sync_state(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        envelope = await self.publish_generic_session_event(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            identity=identity,
            event_type="session.ended",
            payload={
                "session_id": str(session_obj.id),
                "classroom_id": str(classroom_id),
                "status": "completed",
                "ended_at": now.isoformat(),
            },
        )
        await publish_channel_message(
            f"classroom:session:{session_obj.id}",
            {"type": "event", "data": envelope.model_dump(mode="json")},
        )
        await self.session.flush()
        await self.session.refresh(session_obj)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_obj.id,
            reason="session.ended",
        )
        return self._session_to_response(session_obj)

    async def update_session_content(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        data: SessionContentUpdateRequest,
    ) -> SessionResponse:
        """Persist session-linked content asset references, enforcing the content window."""
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )

        # Enforce content window for completed sessions
        is_past_session = session_obj.status in ("completed", "canceled")
        if is_past_session and session_obj.session_end:
            classroom = await self.repo.get_by_id(classroom_id, tenant_id)
            schedule = (classroom.schedule or {}) if classroom else {}
            window_hours = int(schedule.get("content_window_hours", 48))
            deadline = session_obj.session_end + timedelta(hours=window_hours)
            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Content editing window has closed ({window_hours}h after session end).",
                )

        note_text, existing_content = self._parse_session_notes(session_obj.notes)
        shared_asset_ids = (
            [str(x) for x in data.shared_asset_ids]
            if data.shared_asset_ids is not None
            else list(existing_content.get("shared_asset_ids") or [])
        )
        downloadable_asset_ids = (
            [str(x) for x in data.downloadable_asset_ids]
            if data.downloadable_asset_ids is not None
            else list(existing_content.get("downloadable_asset_ids") or [])
        )
        text_assignments = (
            [a.model_dump(mode="json") for a in data.text_assignments]
            if data.text_assignments is not None
            else list(existing_content.get("text_assignments") or [])
        )
        resource_entries = (
            [entry.model_dump(mode="json") for entry in data.resource_entries]
            if data.resource_entries is not None
            else list(existing_content.get("resource_entries") or [])
        )

        actor_name = await self._resolve_actor_display_name(identity)
        now_iso = datetime.now(timezone.utc).isoformat()

        existing_assignment_by_id = {
            str(item.get("id")): item
            for item in (existing_content.get("text_assignments") or [])
            if isinstance(item, dict) and item.get("id")
        }
        normalized_assignments: list[dict] = []
        for item in text_assignments:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            assignment_id = str(item.get("id"))
            previous = existing_assignment_by_id.get(assignment_id, {})
            normalized_assignments.append(
                {
                    **item,
                    "id": assignment_id,
                    "created_by_id": previous.get("created_by_id")
                    or str(identity.id),
                    "created_by_type": previous.get("created_by_type")
                    or self._presence_actor_type(identity),
                    "created_by_name": previous.get("created_by_name")
                    or actor_name,
                    "created_at": previous.get("created_at")
                    or item.get("created_at")
                    or now_iso,
                }
            )

        existing_resource_by_asset = {
            str(item.get("asset_id")): item
            for item in (existing_content.get("resource_entries") or [])
            if isinstance(item, dict) and item.get("asset_id")
        }
        normalized_resources: list[dict] = []
        for item in resource_entries:
            if not isinstance(item, dict) or not item.get("asset_id"):
                continue
            asset_id = str(item.get("asset_id"))
            previous = existing_resource_by_asset.get(asset_id, {})
            normalized_resources.append(
                {
                    **item,
                    "asset_id": asset_id,
                    "attached_by_id": previous.get("attached_by_id")
                    or str(identity.id),
                    "attached_by_type": previous.get("attached_by_type")
                    or self._presence_actor_type(identity),
                    "attached_by_name": previous.get("attached_by_name")
                    or actor_name,
                    "attached_at": previous.get("attached_at")
                    or item.get("attached_at")
                    or now_iso,
                }
            )
        session_obj.notes = self._serialize_session_notes(
            note_text=note_text,
            shared_asset_ids=shared_asset_ids,
            downloadable_asset_ids=downloadable_asset_ids,
            text_assignments=normalized_assignments,
            resource_entries=normalized_resources,
        )
        await self.session.flush()
        await self.session.refresh(session_obj)

        # Notify enrolled students when content is added to a completed session
        if is_past_session:
            try:
                await self._notify_students_content_added(
                    classroom_id=classroom_id,
                    session_obj=session_obj,
                    tenant_id=tenant_id,
                )
            except Exception:
                logger.warning("Failed to queue content-added notifications for session %s", session_id)

        return self._session_to_response(session_obj)

    async def _notify_students_content_added(
        self,
        *,
        classroom_id: UUID,
        session_obj: ClassroomSession,
        tenant_id: UUID,
    ) -> None:
        """Fire in-app and email notifications to enrolled students' parents when content is added."""
        from sqlalchemy import select
        from app.students.models import ParentStudent
        from workers.tasks.notification_tasks import create_notification_task
        from workers.tasks.email_tasks import send_email_task

        enrolled = await self.repo.list_enrolled_students(classroom_id)
        session_date = session_obj.session_start.strftime("%b %-d") if session_obj.session_start else "recent"
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        classroom_name = classroom.name if classroom else "your classroom"
        title = f"New content added to {classroom_name} — {session_date} session"
        body = (
            f"Your instructor has added new resources to the {session_date} session "
            f"in {classroom_name}. Log in to view them."
        )

        for _enrollment, student in enrolled:
            # In-app notification: find parent users linked to this student
            result = await self.session.execute(
                select(ParentStudent).where(ParentStudent.student_id == student.id)
            )
            parent_links = list(result.scalars().all())
            for link in parent_links:
                create_notification_task.delay(
                    str(link.user_id),
                    str(tenant_id),
                    "session_content_added",
                    title,
                    body,
                )

            # Email notification: send to student email if available
            if student.email:
                send_email_task.delay(
                    student.email,
                    title,
                    body,
                    f"<p>{body}</p>",
                )

    async def update_session_details(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        data: SessionEditRequest,
    ) -> SessionResponse:
        """Edit session details: time window, meeting link, and/or notes."""
        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if not session_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if session_obj.status == "canceled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a canceled session")
        if session_obj.status == "deleted":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        if data.session_start is not None or data.session_end is not None:
            new_start = data.session_start or session_obj.session_start
            new_end = data.session_end or session_obj.session_end
            if new_end <= new_start:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Session end must be after session start",
                )
            session_obj.session_start = new_start
            session_obj.session_end = new_end
            if session_obj.status == "completed" and new_end > datetime.now(timezone.utc):
                session_obj.status = "scheduled"

        if data.meeting_link is not None:
            session_obj.meeting_link = data.meeting_link or None

        if data.notes is not None:
            note_text, existing_content = self._parse_session_notes(session_obj.notes)
            session_obj.notes = self._serialize_session_notes(
                note_text=data.notes,
                shared_asset_ids=list(existing_content.get("shared_asset_ids") or []),
                downloadable_asset_ids=list(existing_content.get("downloadable_asset_ids") or []),
                text_assignments=list(existing_content.get("text_assignments") or []),
                resource_entries=list(existing_content.get("resource_entries") or []),
            )

        await self.session.flush()
        await self.session.refresh(session_obj)
        logger.info("Session updated id=%s classroom=%s", session_id, classroom_id)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_id,
            reason="session.updated",
        )
        return self._session_to_response(session_obj)

    async def delete_session(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
    ) -> None:
        """Soft-delete a session (marks status as 'deleted')."""
        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if not session_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if session_obj.status == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete an active session. End it first.",
            )
        session_obj.status = "deleted"
        session_obj.canceled_at = datetime.now(timezone.utc)
        await self.session.flush()
        logger.info("Session deleted id=%s classroom=%s", session_id, classroom_id)
        await self._notify_sessions_changed_for_classroom(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_id,
            reason="session.deleted",
        )

    async def create_session_chat_event(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        data: SessionChatCreateRequest,
        correlation_id: str | None = None,
    ) -> SessionEventResponse:
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        actor_type = self._presence_actor_type(identity)
        event = await self.repo.create_session_event(
            session_id=session_obj.id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            event_type="chat",
            correlation_id=correlation_id,
            actor_id=identity.id,
            actor_type=actor_type,
            message=data.message.strip(),
        )
        return await self._event_to_response(event)

    async def create_session_activity_event(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        data: SessionActivityCreateRequest,
        correlation_id: str | None = None,
    ) -> SessionEventResponse:
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        activity_type = data.activity_type.strip().lower()
        allowed = {"points_awarded", "high_five", "callout"}
        if activity_type not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported activity type",
            )
        points_delta = data.points_delta
        if activity_type == "points_awarded" and not points_delta:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="points_delta is required for points_awarded",
            )
        actor_type = self._presence_actor_type(identity)
        metadata = {"source": "live_session"}
        event = await self.repo.create_session_event(
            session_id=session_obj.id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            event_type=activity_type,
            correlation_id=correlation_id,
            actor_id=identity.id,
            actor_type=actor_type,
            student_id=data.student_id,
            message=(data.message or "").strip() or None,
            points_delta=points_delta,
            metadata_=metadata,
        )
        await self.session.flush()
        if data.student_id:
            from app.notifications.dispatch import enqueue_student_in_app_only

            classroom = await self.repo.get_by_id(classroom_id, tenant_id)
            class_name = (classroom.name or "Class").strip() if classroom else "Class"
            msg = (data.message or "").strip() or None
            if activity_type == "points_awarded":
                pd = points_delta or 0
                title = f"You earned {pd} points in {class_name}"
                body = msg
            elif activity_type == "high_five":
                title = f"High five in {class_name}!"
                body = msg
            elif activity_type == "callout":
                title = f"You're highlighted in {class_name}"
                body = msg
            else:
                title = f"Activity in {class_name}"
                body = msg
            try:
                enqueue_student_in_app_only(
                    tenant_id=tenant_id,
                    student_id=data.student_id,
                    notification_type=f"session.{activity_type}",
                    title=title,
                    body=body,
                )
            except Exception:
                logger.exception("Failed to queue session activity notification")
        return await self._event_to_response(event)

    async def list_session_events(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        event_types: list[str] | None = None,
        limit: int = 500,
    ) -> list[SessionEventResponse]:
        await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        events = await self.repo.list_session_events(
            session_id=session_id,
            tenant_id=tenant_id,
            event_types=event_types,
            limit=limit,
        )
        return [await self._event_to_response(event) for event in events]

    async def replay_session_events(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        after_sequence: int,
        limit: int = 500,
    ) -> list[RealtimeEventEnvelope]:
        await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        rows = await self.repo.list_session_events_after(
            session_id=session_id,
            tenant_id=tenant_id,
            after_sequence=max(0, after_sequence),
            limit=limit,
        )
        return [await self._event_to_envelope(row) for row in rows]

    async def get_realtime_snapshot(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        after_sequence: int = 0,
        replay_limit: int = 500,
    ) -> RealtimeSessionSnapshotResponse:
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        now = datetime.now(timezone.utc)
        presence = await self._build_presence_summary(session_obj=session_obj, now=now)
        participants = await self.get_session_presence_participants(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        state_row = await self.repo.get_or_create_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        if session_obj.status in {"canceled", "completed"}:
            metadata = dict(state_row.metadata_ or {})
            if LIVE_SYNC_STATE_KEY in metadata:
                metadata.pop(LIVE_SYNC_STATE_KEY, None)
                state_row = await self.repo.update_session_state(
                    session_id=session_id,
                    classroom_id=classroom_id,
                    tenant_id=tenant_id,
                    metadata_=metadata,
                )
        latest_sequence = await self.repo.get_latest_session_event_sequence(session_id)
        events = await self.replay_session_events(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            after_sequence=after_sequence,
            limit=replay_limit,
        )
        return RealtimeSessionSnapshotResponse(
            session=self._session_to_response(session_obj),
            presence=presence,
            participants=participants,
            state=self._session_state_to_response(state_row, session_obj=session_obj),
            latest_sequence=latest_sequence,
            events=events,
        )

    async def publish_generic_session_event(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        event_type: str,
        payload: dict | None = None,
        correlation_id: str | None = None,
    ) -> RealtimeEventEnvelope:
        session_obj = await self._ensure_session_exists(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
        )
        actor_type = self._presence_actor_type(identity)
        normalized_type = (event_type or "").strip() or "session.generic"
        await self._persist_live_sync_patch(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            event_type=normalized_type,
            payload=payload,
        )
        event = await self.repo.create_session_event(
            session_id=session_obj.id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            event_type=normalized_type,
            correlation_id=correlation_id,
            actor_id=identity.id,
            actor_type=actor_type,
            metadata_=payload or {},
        )
        await self.session.flush()
        return await self._event_to_envelope(event)

    async def set_session_active_lab(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        active_lab: str | None,
        correlation_id: str | None = None,
    ) -> RealtimeEventEnvelope:
        state_row = await self.repo.update_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            active_lab=(active_lab.strip() if active_lab else None),
        )
        envelope = await self.publish_generic_session_event(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            identity=identity,
            event_type="session.lab.selected",
            payload={"active_lab": state_row.active_lab},
            correlation_id=correlation_id,
        )
        return envelope

    async def upsert_session_assignment(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        assignment: dict,
        correlation_id: str | None = None,
    ) -> RealtimeEventEnvelope:
        state_row = await self.repo.get_or_create_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        assignments = list(state_row.assignments or [])
        now_iso = datetime.now(timezone.utc).isoformat()
        assignment_id = str(assignment.get("id") or uuid.uuid4())
        normalized = {
            "id": assignment_id,
            "title": str(assignment.get("title") or "").strip(),
            "instructions": str(assignment.get("instructions") or "").strip(),
            "due_at": assignment.get("due_at"),
            "updated_at": now_iso,
        }
        replaced = False
        for idx, row in enumerate(assignments):
            if str(row.get("id")) == assignment_id:
                assignments[idx] = {**row, **normalized}
                replaced = True
                break
        if not replaced:
            assignments.insert(0, normalized)
        await self.repo.update_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            assignments=assignments,
        )
        event_type = "assignment.updated" if replaced else "assignment.created"
        return await self.publish_generic_session_event(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            identity=identity,
            event_type=event_type,
            payload={"assignment": normalized, "assignments": assignments},
            correlation_id=correlation_id,
        )

    async def delete_session_assignment(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        assignment_id: str,
        correlation_id: str | None = None,
    ) -> RealtimeEventEnvelope:
        state_row = await self.repo.get_or_create_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        assignments = list(state_row.assignments or [])
        next_assignments = [row for row in assignments if str(row.get("id")) != str(assignment_id)]
        await self.repo.update_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            assignments=next_assignments,
        )
        return await self.publish_generic_session_event(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant_id,
            identity=identity,
            event_type="assignment.deleted",
            payload={"assignment_id": assignment_id, "assignments": next_assignments},
            correlation_id=correlation_id,
        )

    async def regenerate_meeting(
        self,
        classroom_id: UUID,
        tenant_id: UUID,
        data: RegenerateMeetingRequest,
        user_id: UUID,
    ) -> RegenerateMeetingResponse:
        """Regenerate meeting link via the requested provider.

        Looks up the instructor's (or caller's) OAuth connection for the
        given provider and creates a real meeting.  Falls back to
        clearing the link if auto-generation is not enabled.
        """
        from app.integrations.meeting_service import MeetingService, MeetingServiceError

        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found",
            )

        new_join_code = await self.repo.generate_unique_join_code()
        classroom.join_code = new_join_code

        instructor_id = classroom.instructor_id or user_id

        meeting_svc = MeetingService(self.session)
        try:
            result = await meeting_svc.create_meeting(
                user_id=instructor_id,
                tenant_id=tenant_id,
                provider_key=data.provider,
                title=classroom.name,
            )
            classroom.meeting_link = result.meeting_link
            classroom.external_meeting_id = result.external_meeting_id
            classroom.meeting_provider = data.provider
            classroom.meeting_auto_generated = True
        except MeetingServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

        await self.session.flush()
        await self.session.refresh(classroom)
        return RegenerateMeetingResponse(
            meeting_link=classroom.meeting_link,
            join_code=classroom.join_code,
            external_meeting_id=classroom.external_meeting_id,
            meeting_provider=classroom.meeting_provider,
        )

    # ── Assignments ───────────────────────────────────────────────────────────

    async def list_classroom_assignments(
        self, *, classroom_id: UUID, tenant_id: UUID, identity: CurrentIdentity
    ) -> list[dict]:
        """Return all assignments across every session of a classroom (instructor view)."""
        from sqlalchemy import select
        from app.classrooms.models import ClassroomSessionEvent, ClassroomSessionState

        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if classroom is None:
            raise HTTPException(status_code=404, detail="Classroom not found")

        is_staff = identity.role in {"admin", "owner", "instructor", "super_admin"}
        if not is_staff:
            if identity.sub_type != "student":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions to view assignments",
                )
            enrollment = await self.repo.get_enrollment(classroom_id, identity.id)
            if enrollment is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Student is not enrolled in this classroom",
                )

        sessions = await self.repo.list_sessions(
            classroom_id=classroom_id, tenant_id=tenant_id, limit=500
        )
        if not sessions:
            return []

        session_ids = [s.id for s in sessions]
        session_map = {s.id: s for s in sessions}

        state_result = await self.session.execute(
            select(ClassroomSessionState).where(
                ClassroomSessionState.session_id.in_(session_ids),
                ClassroomSessionState.tenant_id == tenant_id,
            )
        )
        states = {row.session_id: row for row in state_result.scalars().all()}

        # Count submitted submissions per session
        sub_result = await self.session.execute(
            select(ClassroomSessionEvent).where(
                ClassroomSessionEvent.session_id.in_(session_ids),
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.event_type == "student.submission.submitted",
            )
        )
        submissions = sub_result.scalars().all()
        # Map (session_id, assignment_id) -> count of distinct students
        sub_counts: dict[tuple[str, str], set[str]] = {}
        for ev in submissions:
            meta = ev.metadata_ or {}
            aid = str(meta.get("assignment_id") or "")
            key = (str(ev.session_id), aid)
            sub_counts.setdefault(key, set()).add(str(meta.get("student_id") or ev.actor_id))

        result: list[dict] = []
        for session in sessions:
            state = states.get(session.id)
            if not state:
                continue
            for raw in state.assignments or []:
                if not isinstance(raw, dict):
                    continue
                aid = str(raw.get("id") or "")
                if not aid:
                    continue
                count = len(sub_counts.get((str(session.id), aid), set()))
                result.append(
                    {
                        "id": aid,
                        "title": str(raw.get("title") or "Assignment"),
                        "instructions": raw.get("instructions") or None,
                        "due_at": raw.get("due_at"),
                        "lab_id": raw.get("lab_id") or None,
                        "requires_lab": bool(raw.get("requires_lab")),
                        "requires_assets": bool(raw.get("requires_assets")),
                        "allow_edit_after_submit": bool(raw.get("allow_edit_after_submit")),
                        "session_id": str(session.id),
                        "session_start": session.session_start.isoformat(),
                        "session_end": session.session_end.isoformat(),
                        "session_status": session.status,
                        "submission_count": count,
                    }
                )
        result.sort(
            key=lambda x: (x.get("due_at") is None, str(x.get("due_at") or ""))
        )
        return result

    async def can_student_edit_submission(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        student_id: UUID,
        assignment_id: str | None,
    ) -> bool:
        """Return whether student can still edit submission for assignment/session."""
        if not assignment_id:
            return True

        session_obj = await self.repo.get_session_by_id(session_id, classroom_id, tenant_id)
        if session_obj is None:
            raise HTTPException(status_code=404, detail="Session not found")

        _note_text, content = self._parse_session_notes(session_obj.notes)
        assignment_cfg = next(
            (
                item
                for item in (content.get("text_assignments") or [])
                if isinstance(item, dict) and str(item.get("id")) == str(assignment_id)
            ),
            None,
        )
        allow_edit_after_submit = bool(
            assignment_cfg.get("allow_edit_after_submit") if assignment_cfg else False
        )
        if allow_edit_after_submit:
            return True

        from app.classrooms.models import ClassroomSessionEvent

        submitted_events = await self.session.execute(
            select(ClassroomSessionEvent).where(
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.event_type == "student.submission.submitted",
                ClassroomSessionEvent.actor_id == student_id,
            )
        )
        for ev in submitted_events.scalars().all():
            meta = ev.metadata_ or {}
            if str(meta.get("assignment_id") or "") == str(assignment_id):
                return False
        return True

    async def list_session_submissions(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        assignment_id: str | None = None,
        student_id: UUID | None = None,
    ) -> list[dict]:
        """Return all student submissions for a session, enriched with any grades."""
        from sqlalchemy import select, or_
        from app.classrooms.models import ClassroomSessionEvent

        events_result = await self.session.execute(
            select(ClassroomSessionEvent).where(
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
                or_(
                    ClassroomSessionEvent.event_type == "student.submission.submitted",
                    ClassroomSessionEvent.event_type == "student.submission.saved",
                ),
            ).order_by(ClassroomSessionEvent.created_at.desc())
        )
        submissions = events_result.scalars().all()

        grade_events_result = await self.session.execute(
            select(ClassroomSessionEvent).where(
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.event_type == "instructor.submission.graded",
            )
        )
        grade_events = grade_events_result.scalars().all()
        # Map submission_event_id -> latest grade event
        grade_map: dict[str, ClassroomSessionEvent] = {}
        for ge in grade_events:
            meta = ge.metadata_ or {}
            ref = str(meta.get("submission_event_id") or "")
            if ref:
                grade_map[ref] = ge

        # Deduplicate: one submission per (student_id, assignment_id), keep latest
        seen: dict[tuple[str, str], ClassroomSessionEvent] = {}
        for ev in submissions:
            meta = ev.metadata_ or {}
            aid = str(meta.get("assignment_id") or "")
            if assignment_id is not None and aid != assignment_id:
                continue
            sid = str(meta.get("student_id") or ev.actor_id)
            if student_id is not None and sid != str(student_id):
                continue
            key = (sid, aid)
            if key not in seen:
                seen[key] = ev

        result = []
        for ev in seen.values():
            meta = ev.metadata_ or {}
            ev_id = str(ev.id)
            grade_ev = grade_map.get(ev_id)
            grade_meta = grade_ev.metadata_ if grade_ev else {}
            student_id = str(meta.get("student_id") or ev.actor_id)
            try:
                student_uuid = UUID(student_id)
                student_display_name = await self._resolve_student_name(student_uuid)
            except Exception:
                student_display_name = None
            result.append(
                {
                    "event_id": ev_id,
                    "session_id": str(ev.session_id),
                    "assignment_id": meta.get("assignment_id"),
                    "student_id": student_id,
                    "student_display_name": student_display_name,
                    "content": str(meta.get("content") or ""),
                    "status": str(meta.get("status") or ev.event_type.split(".")[-1]),
                    "submitted_at": ev.created_at.isoformat(),
                    "grade": grade_meta.get("score") if grade_meta else None,
                    "feedback": grade_meta.get("feedback") if grade_meta else None,
                    "graded_at": grade_ev.created_at.isoformat() if grade_ev else None,
                }
            )
        return result

    async def notify_instructor_submission(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        tenant_id: UUID,
        student_id: UUID,
        assignment_id: str | None,
    ) -> None:
        """Notify instructor when a student submits assignment work."""
        classroom = await self.repo.get_by_id(classroom_id, tenant_id)
        if classroom is None or classroom.instructor_id is None:
            return

        instructor = await self.session.get(User, classroom.instructor_id)
        if instructor is None:
            return

        student_name = await self._resolve_student_name(student_id) or "A student"
        classroom_name = classroom.name.strip() or "your classroom"
        assignment_label = assignment_id or "an assignment"
        title = f"New submission in {classroom_name}"
        body = f"{student_name} submitted work for {assignment_label}."

        self.session.add(
            Notification(
                user_id=instructor.id,
                student_id=None,
                tenant_id=tenant_id,
                type="assignment_submission",
                title=title,
                body=body,
                action_path=f"/app/classrooms/{classroom_id}?tab=submissions",
                action_label="Review submission",
            )
        )
        await self.session.flush()
        try:
            await publish_notifications_changed(tenant_id, instructor.id)
        except Exception:
            logger.exception("Failed to publish instructor submission notification")

        if instructor.email:
            from workers.tasks.email_tasks import send_email_task

            session_phrase = f"Session {session_id}"
            plain = (
                f"{student_name} submitted work for {assignment_label} in {classroom_name} "
                f"({session_phrase})."
            )
            html = f"<p>{plain}</p>"
            send_email_task.delay(
                instructor.email,
                title,
                plain,
                html,
            )

    async def grade_submission(
        self,
        *,
        classroom_id: UUID,
        session_id: UUID,
        submission_event_id: UUID,
        tenant_id: UUID,
        identity: "CurrentIdentity",
        score: int,
        feedback: str | None,
        assignment_id: str | None,
    ) -> dict:
        """Record a grade for a student submission via a new session event."""
        from app.classrooms.models import ClassroomSessionEvent

        # Verify the submission event exists and belongs to this session
        ev_result = await self.session.execute(
            select(ClassroomSessionEvent).where(
                ClassroomSessionEvent.id == submission_event_id,
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
            )
        )
        ev = ev_result.scalar_one_or_none()
        if ev is None:
            raise HTTPException(status_code=404, detail="Submission not found")

        student_id = str((ev.metadata_ or {}).get("student_id") or ev.actor_id)
        student_uuid: UUID | None = None
        try:
            student_uuid = UUID(student_id)
        except Exception:
            student_uuid = None

        actor_type = self._presence_actor_type(identity)
        grade_event = await self.repo.create_session_event(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            event_type="instructor.submission.graded",
            actor_id=identity.id,
            actor_type=actor_type,
            student_id=student_uuid,
            metadata_={
                "submission_event_id": str(submission_event_id),
                "assignment_id": assignment_id,
                "student_id": student_id,
                "score": score,
                "feedback": feedback,
                "graded_by": str(identity.id),
            },
        )
        await self.session.flush()
        await self.session.refresh(grade_event)

        # Notify student that grading is available.
        if student_uuid:
            classroom = await self.repo.get_by_id(classroom_id, tenant_id)
            class_name = classroom.name.strip() if classroom and classroom.name else "your classroom"
            notif_title = f"Your work was graded in {class_name}"
            notif_body = (
                f"You received {score}/100"
                + (f": {feedback}" if feedback else ".")
            )
            self.session.add(
                Notification(
                    user_id=None,
                    student_id=student_uuid,
                    tenant_id=tenant_id,
                    type="assignment_graded",
                    title=notif_title,
                    body=notif_body,
                    action_path=f"/app/classrooms/{classroom_id}?tab=assignments",
                    action_label="View feedback",
                )
            )
            await self.session.flush()
            try:
                await publish_notifications_changed(tenant_id, student_uuid)
            except Exception:
                logger.exception("Failed to publish student graded notification")
            try:
                student = await self.session.get(Student, student_uuid)
                student_name = (
                    student.display_name
                    if student and student.display_name
                    else await self._resolve_student_name(student_uuid)
                    or "Your child"
                )
                if student and student.email:
                    from workers.tasks.email_tasks import send_email_task

                    plain = f"{notif_title}. {notif_body}"
                    html = f"<p>{plain}</p>"
                    send_email_task.delay(student.email, notif_title, plain, html)

                # Notify linked parents/guardians in-app and via email.
                parent_links_result = await self.session.execute(
                    select(ParentStudent).where(ParentStudent.student_id == student_uuid)
                )
                parent_links = parent_links_result.scalars().all()
                parent_user_ids: list[UUID] = []
                for link in parent_links:
                    parent_user = await self.session.get(User, link.user_id)
                    if not parent_user:
                        continue
                    parent_user_ids.append(parent_user.id)
                    parent_title = f"{student_name}'s work was graded in {class_name}"
                    parent_body = (
                        f"{student_name} received {score}/100"
                        + (f": {feedback}" if feedback else ".")
                    )
                    self.session.add(
                        Notification(
                            user_id=parent_user.id,
                            student_id=None,
                            tenant_id=tenant_id,
                            type="assignment_graded",
                            title=parent_title,
                            body=parent_body,
                            action_path=f"/app/classrooms/{classroom_id}?tab=assignments",
                            action_label="View classwork",
                        )
                    )
                    if parent_user.email:
                        from workers.tasks.email_tasks import send_email_task

                        parent_plain = f"{parent_title}. {parent_body}"
                        parent_html = f"<p>{parent_plain}</p>"
                        send_email_task.delay(
                            parent_user.email,
                            parent_title,
                            parent_plain,
                            parent_html,
                        )
                if parent_user_ids:
                    await self.session.flush()
                    for parent_user_id in parent_user_ids:
                        try:
                            await publish_notifications_changed(tenant_id, parent_user_id)
                        except Exception:
                            logger.exception(
                                "Failed to publish parent graded notification"
                            )
            except Exception:
                logger.exception("Failed to queue student graded email")

        return {
            "event_id": str(grade_event.id),
            "submission_event_id": str(submission_event_id),
            "student_id": student_id,
            "score": score,
            "feedback": feedback,
            "graded_at": grade_event.created_at.isoformat(),
        }
