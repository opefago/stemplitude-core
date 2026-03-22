"""Classroom repository."""

import secrets
import string
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import (
    Classroom,
    ClassroomSession,
    ClassroomSessionEvent,
    ClassroomSessionPresence,
    ClassroomSessionState,
    ClassroomStudent,
)
from app.curriculum.models import Course
from app.progress.models import Attendance
from app.programs.models import Program
from app.students.models import Student
from app.users.models import User


def _generate_join_code() -> str:
    """Generate a random 8-character alphanumeric join code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


class ClassroomRepository:
    """Repository for classroom queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def generate_unique_join_code(self) -> str:
        """Generate a unique join code (retry on collision)."""
        for _ in range(10):
            code = _generate_join_code()
            if not await self.join_code_exists(code):
                return code
        raise RuntimeError("Could not generate unique join code")

    async def join_code_exists(self, join_code: str) -> bool:
        """Check if join code is already in use."""
        result = await self.session.execute(
            select(Classroom.id).where(Classroom.join_code == join_code)
        )
        return result.scalar_one_or_none() is not None

    async def get_by_id(
        self, classroom_id: UUID, tenant_id: UUID, include_deleted: bool = False
    ) -> Classroom | None:
        """Get classroom by ID within tenant."""
        query = select(Classroom).where(
            Classroom.id == classroom_id,
            Classroom.tenant_id == tenant_id,
        )
        if not include_deleted:
            query = query.where(Classroom.deleted_at.is_(None))
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
        program_id: UUID | None = None,
        curriculum_id: UUID | None = None,
    ) -> list[Classroom]:
        """List classrooms for a tenant."""
        query = (
            select(Classroom)
            .where(Classroom.tenant_id == tenant_id, Classroom.deleted_at.is_(None))
        )
        if is_active is not None:
            query = query.where(Classroom.is_active == is_active)
        if program_id is not None:
            query = query.where(Classroom.program_id == program_id)
        if curriculum_id is not None:
            query = query.where(Classroom.curriculum_id == curriculum_id)
        query = query.order_by(Classroom.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_with_relationship_summaries(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
        program_id: UUID | None = None,
        curriculum_id: UUID | None = None,
    ) -> list[tuple]:
        """List classrooms with program/curriculum names and program term dates."""
        query = (
            select(
                Classroom,
                Program.name,
                Course.title,
                Program.start_date,
                Program.end_date,
            )
            .outerjoin(Program, Program.id == Classroom.program_id)
            .outerjoin(Course, Course.id == Classroom.curriculum_id)
            .where(
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
            )
        )
        if is_active is not None:
            query = query.where(Classroom.is_active == is_active)
        if program_id is not None:
            query = query.where(Classroom.program_id == program_id)
        if curriculum_id is not None:
            query = query.where(Classroom.curriculum_id == curriculum_id)
        query = query.order_by(Classroom.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.all())

    async def get_with_relationship_summary(
        self, classroom_id: UUID, tenant_id: UUID
    ) -> tuple | None:
        """Get one classroom with program/curriculum names and program term dates."""
        result = await self.session.execute(
            select(
                Classroom,
                Program.name,
                Course.title,
                Program.start_date,
                Program.end_date,
            )
            .outerjoin(Program, Program.id == Classroom.program_id)
            .outerjoin(Course, Course.id == Classroom.curriculum_id)
            .where(
                Classroom.id == classroom_id,
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
            )
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None
        return row

    async def class_name_exists(
        self,
        *,
        tenant_id: UUID,
        name: str,
        exclude_classroom_id: UUID | None = None,
    ) -> bool:
        """Check if a classroom name already exists within tenant."""
        query = select(Classroom.id).where(
            Classroom.tenant_id == tenant_id,
            Classroom.deleted_at.is_(None),
            func.lower(Classroom.name) == name.strip().lower(),
        )
        if exclude_classroom_id is not None:
            query = query.where(Classroom.id != exclude_classroom_id)
        result = await self.session.execute(query.limit(1))
        return result.scalar_one_or_none() is not None

    @staticmethod
    def _to_minutes(raw: str | None) -> int | None:
        if not raw or ":" not in raw:
            return None
        parts = raw.split(":", 1)
        try:
            hours = int(parts[0])
            minutes = int(parts[1])
        except (TypeError, ValueError):
            return None
        if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
            return None
        return hours * 60 + minutes

    async def find_instructor_schedule_conflicts(
        self,
        *,
        tenant_id: UUID,
        instructor_id: UUID,
        selected_days: list[str],
        start_time: str,
        end_time: str,
        exclude_classroom_id: UUID | None = None,
    ) -> list[UUID]:
        """Return classroom IDs that overlap with requested schedule."""
        next_start = self._to_minutes(start_time)
        next_end = self._to_minutes(end_time)
        if next_start is None or next_end is None or next_end <= next_start:
            return []
        target_days = {day.strip().lower() for day in selected_days if day}
        if not target_days:
            return []

        query = select(Classroom).where(
            Classroom.tenant_id == tenant_id,
            Classroom.deleted_at.is_(None),
            Classroom.instructor_id == instructor_id,
        )
        if exclude_classroom_id is not None:
            query = query.where(Classroom.id != exclude_classroom_id)
        result = await self.session.execute(query)
        rows = list(result.scalars().all())

        conflicts: list[UUID] = []
        for row in rows:
            schedule = row.schedule or {}
            if not isinstance(schedule, dict):
                continue
            existing_days_raw = schedule.get("days") or []
            if not isinstance(existing_days_raw, list):
                continue
            existing_days = {str(day).strip().lower() for day in existing_days_raw if day}
            if not existing_days.intersection(target_days):
                continue
            existing_start = self._to_minutes(schedule.get("time"))
            existing_end = self._to_minutes(schedule.get("end_time"))
            if existing_start is None:
                continue
            if existing_end is None or existing_end <= existing_start:
                existing_end = existing_start + 60
            overlaps = next_start < existing_end and next_end > existing_start
            if overlaps:
                conflicts.append(row.id)
        return conflicts

    async def bulk_assign_curriculum(
        self,
        *,
        tenant_id: UUID,
        classroom_ids: list[UUID],
        curriculum_id: UUID | None,
        program_id: UUID | None,
    ) -> int:
        """Bulk assign curriculum and optional program derivation."""
        if not classroom_ids:
            return 0
        result = await self.session.execute(
            update(Classroom)
            .where(
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
                Classroom.id.in_(classroom_ids),
            )
            .values(curriculum_id=curriculum_id, program_id=program_id)
        )
        return int(result.rowcount or 0)

    async def get_enrollment(
        self, classroom_id: UUID, student_id: UUID
    ) -> ClassroomStudent | None:
        """Get classroom enrollment."""
        result = await self.session.execute(
            select(ClassroomStudent).where(
                ClassroomStudent.classroom_id == classroom_id,
                ClassroomStudent.student_id == student_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_enrolled_students(
        self, classroom_id: UUID
    ) -> list[tuple[ClassroomStudent, Student]]:
        """List enrolled students with student details."""
        result = await self.session.execute(
            select(ClassroomStudent, Student)
            .join(Student, ClassroomStudent.student_id == Student.id)
            .where(ClassroomStudent.classroom_id == classroom_id)
            .order_by(ClassroomStudent.enrolled_at.desc())
        )
        return list(result.all())

    async def get_session_by_id(
        self, session_id: UUID, classroom_id: UUID, tenant_id: UUID
    ) -> ClassroomSession | None:
        """Get classroom session by ID."""
        result = await self.session.execute(
            select(ClassroomSession).where(
                ClassroomSession.id == session_id,
                ClassroomSession.classroom_id == classroom_id,
                ClassroomSession.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self, classroom_id: UUID, tenant_id: UUID, *, limit: int = 100
    ) -> list[ClassroomSession]:
        """List sessions for a classroom, excluding soft-deleted sessions."""
        result = await self.session.execute(
            select(ClassroomSession)
            .where(
                ClassroomSession.classroom_id == classroom_id,
                ClassroomSession.tenant_id == tenant_id,
                ClassroomSession.status != "deleted",
            )
            .order_by(ClassroomSession.session_start.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def find_active_session(
        self, classroom_id: UUID, tenant_id: UUID, *, now: datetime | None = None
    ) -> ClassroomSession | None:
        """Find the currently active session for a classroom."""
        current = now or datetime.now(timezone.utc)
        result = await self.session.execute(
            select(ClassroomSession)
            .where(
                ClassroomSession.classroom_id == classroom_id,
                ClassroomSession.tenant_id == tenant_id,
                ClassroomSession.status.notin_(["canceled", "completed"]),
                ClassroomSession.session_start <= current,
                ClassroomSession.session_end >= current,
            )
            .order_by(ClassroomSession.session_start.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_presence_row(
        self,
        session_id: UUID,
        actor_id: UUID,
        actor_type: str,
    ) -> ClassroomSessionPresence | None:
        """Get presence row for a session actor."""
        result = await self.session.execute(
            select(ClassroomSessionPresence).where(
                ClassroomSessionPresence.session_id == session_id,
                ClassroomSessionPresence.actor_id == actor_id,
                ClassroomSessionPresence.actor_type == actor_type,
            )
        )
        return result.scalar_one_or_none()

    async def upsert_presence(
        self,
        *,
        session_id: UUID,
        classroom_id: UUID,
        tenant_id: UUID,
        actor_id: UUID,
        actor_type: str,
        seen_at: datetime,
    ) -> ClassroomSessionPresence:
        """Create or refresh a participant presence row."""
        row = await self.get_presence_row(session_id, actor_id, actor_type)
        if row:
            if row.first_seen_at is None:
                row.first_seen_at = seen_at
            row.last_seen_at = seen_at
            row.left_at = None
            return row

        row = ClassroomSessionPresence(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_type=actor_type,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
        )
        self.session.add(row)
        return row

    async def mark_presence_left(
        self,
        *,
        session_id: UUID,
        actor_id: UUID,
        actor_type: str,
        left_at: datetime,
    ) -> None:
        """Mark the actor as having left the session."""
        row = await self.get_presence_row(session_id, actor_id, actor_type)
        if row:
            row.last_seen_at = left_at
            row.left_at = left_at

    async def get_session_presence_summary(
        self,
        *,
        session_id: UUID,
        active_after: datetime,
    ) -> dict[str, int | datetime | None]:
        """Get counts and latest-seen timestamps for session presence."""
        active_result = await self.session.execute(
            select(ClassroomSessionPresence.actor_type, func.count(ClassroomSessionPresence.id))
            .where(
                ClassroomSessionPresence.session_id == session_id,
                ClassroomSessionPresence.left_at.is_(None),
                ClassroomSessionPresence.last_seen_at >= active_after,
            )
            .group_by(ClassroomSessionPresence.actor_type)
        )
        active_counts = {actor_type: count for actor_type, count in active_result.all()}

        latest_seen_result = await self.session.execute(
            select(func.max(ClassroomSessionPresence.last_seen_at)).where(
                ClassroomSessionPresence.session_id == session_id
            )
        )
        latest_seen = latest_seen_result.scalar_one_or_none()

        total_active = int(sum(active_counts.values()))
        return {
            "active_students": int(active_counts.get("student", 0)),
            "active_instructors": int(active_counts.get("instructor", 0)),
            "active_users": int(active_counts.get("user", 0)),
            "active_total": total_active,
            "latest_seen_at": latest_seen,
        }

    async def list_active_session_participants(
        self,
        *,
        session_id: UUID,
        active_after: datetime,
    ) -> list[dict[str, object]]:
        """List active participants with resolved names."""
        result = await self.session.execute(
            select(
                ClassroomSessionPresence.actor_id,
                ClassroomSessionPresence.actor_type,
                ClassroomSessionPresence.last_seen_at,
            ).where(
                ClassroomSessionPresence.session_id == session_id,
                ClassroomSessionPresence.left_at.is_(None),
                ClassroomSessionPresence.last_seen_at >= active_after,
            )
        )
        rows = result.all()
        if not rows:
            return []

        student_ids = [actor_id for actor_id, actor_type, _ in rows if actor_type == "student"]
        user_ids = [actor_id for actor_id, actor_type, _ in rows if actor_type in {"instructor", "user"}]

        students_by_id: dict[UUID, Student] = {}
        users_by_id: dict[UUID, User] = {}

        if student_ids:
            student_result = await self.session.execute(
                select(Student).where(Student.id.in_(student_ids))
            )
            students_by_id = {student.id: student for student in student_result.scalars().all()}

        if user_ids:
            user_result = await self.session.execute(
                select(User).where(User.id.in_(user_ids))
            )
            users_by_id = {user.id: user for user in user_result.scalars().all()}

        participants: list[dict[str, object]] = []
        for actor_id, actor_type, last_seen_at in rows:
            display_name = "Participant"
            email = None
            if actor_type == "student":
                student = students_by_id.get(actor_id)
                if student:
                    display_name = student.display_name or f"{student.first_name} {student.last_name}".strip()
                    email = student.email
            else:
                user = users_by_id.get(actor_id)
                if user:
                    display_name = f"{user.first_name} {user.last_name}".strip()
                    email = user.email
            participants.append(
                {
                    "actor_id": actor_id,
                    "actor_type": actor_type,
                    "display_name": display_name,
                    "email": email,
                    "last_seen_at": last_seen_at,
                }
            )
        participants.sort(key=lambda p: (str(p["actor_type"]), str(p["display_name"])))
        return participants

    async def get_attendance(
        self, session_id: UUID, student_id: UUID
    ) -> Attendance | None:
        """Get attendance record for session and student."""
        result = await self.session.execute(
            select(Attendance).where(
                Attendance.session_id == session_id,
                Attendance.student_id == student_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_attendance(
        self,
        classroom_id: UUID,
        *,
        session_id: UUID | None = None,
        limit: int = 200,
    ) -> list[Attendance]:
        """List attendance records for a classroom."""
        query = select(Attendance).where(Attendance.classroom_id == classroom_id)
        if session_id is not None:
            query = query.where(Attendance.session_id == session_id)
        query = query.order_by(Attendance.created_at.desc()).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def create_session_event(
        self,
        *,
        session_id: UUID,
        classroom_id: UUID,
        tenant_id: UUID,
        event_type: str,
        actor_id: UUID,
        actor_type: str,
        student_id: UUID | None = None,
        message: str | None = None,
        points_delta: int | None = None,
        metadata_: dict | None = None,
        correlation_id: str | None = None,
    ) -> ClassroomSessionEvent:
        # Serialize sequence assignment by row-locking the parent session.
        await self.session.execute(
            select(ClassroomSession.id)
            .where(ClassroomSession.id == session_id)
            .with_for_update()
        )
        seq_result = await self.session.execute(
            select(func.coalesce(func.max(ClassroomSessionEvent.sequence), 0)).where(
                ClassroomSessionEvent.session_id == session_id
            )
        )
        next_sequence = int(seq_result.scalar_one() or 0) + 1

        event = ClassroomSessionEvent(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            event_type=event_type,
            sequence=next_sequence,
            correlation_id=correlation_id,
            actor_id=actor_id,
            actor_type=actor_type,
            student_id=student_id,
            message=message,
            points_delta=points_delta,
            metadata_=metadata_ or {},
        )
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def get_latest_session_event_sequence(self, session_id: UUID) -> int:
        result = await self.session.execute(
            select(func.coalesce(func.max(ClassroomSessionEvent.sequence), 0)).where(
                ClassroomSessionEvent.session_id == session_id
            )
        )
        return int(result.scalar_one() or 0)

    async def list_session_events_after(
        self,
        *,
        session_id: UUID,
        tenant_id: UUID,
        after_sequence: int,
        limit: int = 500,
    ) -> list[ClassroomSessionEvent]:
        result = await self.session.execute(
            select(ClassroomSessionEvent)
            .where(
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.sequence > after_sequence,
            )
            .order_by(ClassroomSessionEvent.sequence.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_session_state(
        self,
        *,
        session_id: UUID,
        classroom_id: UUID,
        tenant_id: UUID,
    ) -> ClassroomSessionState | None:
        result = await self.session.execute(
            select(ClassroomSessionState).where(
                ClassroomSessionState.session_id == session_id,
                ClassroomSessionState.classroom_id == classroom_id,
                ClassroomSessionState.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create_session_state(
        self,
        *,
        session_id: UUID,
        classroom_id: UUID,
        tenant_id: UUID,
    ) -> ClassroomSessionState:
        row = await self.get_session_state(
            session_id=session_id, classroom_id=classroom_id, tenant_id=tenant_id
        )
        if row:
            return row
        row = ClassroomSessionState(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
            assignments=[],
            metadata_={},
        )
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)
        return row

    async def update_session_state(
        self,
        *,
        session_id: UUID,
        classroom_id: UUID,
        tenant_id: UUID,
        active_lab: str | None = None,
        assignments: list[dict] | None = None,
        metadata_: dict | None = None,
    ) -> ClassroomSessionState:
        row = await self.get_or_create_session_state(
            session_id=session_id,
            classroom_id=classroom_id,
            tenant_id=tenant_id,
        )
        if active_lab is not None or active_lab == "":
            row.active_lab = active_lab or None
        if assignments is not None:
            row.assignments = assignments
        if metadata_ is not None:
            row.metadata_ = metadata_
        await self.session.flush()
        await self.session.refresh(row)
        return row

    async def list_session_events(
        self,
        *,
        session_id: UUID,
        tenant_id: UUID,
        event_types: list[str] | None = None,
        limit: int = 500,
    ) -> list[ClassroomSessionEvent]:
        query = (
            select(ClassroomSessionEvent)
            .where(
                ClassroomSessionEvent.session_id == session_id,
                ClassroomSessionEvent.tenant_id == tenant_id,
            )
            .order_by(ClassroomSessionEvent.created_at.asc())
            .limit(limit)
        )
        if event_types:
            query = query.where(ClassroomSessionEvent.event_type.in_(event_types))
        result = await self.session.execute(query)
        return list(result.scalars().all())
