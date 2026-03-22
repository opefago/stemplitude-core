from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import or_

from app.classrooms.models import (
    Classroom,
    ClassroomSession,
    ClassroomSessionEvent,
    ClassroomSessionState,
    ClassroomStudent,
)
from app.students.models import ParentStudent, Student, StudentMembership
from app.tenants.models import Tenant


class StudentRepository:
    """Repository for Student and related models."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, student_id: UUID) -> Student | None:
        result = await self.session.execute(select(Student).where(Student.id == student_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Student | None:
        result = await self.session.execute(select(Student).where(Student.email == email))
        return result.scalar_one_or_none()

    async def create(self, student: Student) -> Student:
        self.session.add(student)
        await self.session.flush()
        await self.session.refresh(student)
        return student

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
    ) -> list[Student]:
        query = (
            select(Student)
            .join(StudentMembership, StudentMembership.student_id == Student.id)
            .where(
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
            )
        )
        if is_active is not None:
            query = query.where(Student.is_active == is_active)
        query = query.offset(skip).limit(limit).distinct()
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_membership(
        self, student_id: UUID, tenant_id: UUID
    ) -> StudentMembership | None:
        result = await self.session.execute(
            select(StudentMembership).where(
                StudentMembership.student_id == student_id,
                StudentMembership.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def username_exists_in_tenant(self, username: str, tenant_id: UUID) -> bool:
        result = await self.session.execute(
            select(StudentMembership.id).where(
                StudentMembership.username == username,
                StudentMembership.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def list_memberships(self, student_id: UUID) -> list[StudentMembership]:
        result = await self.session.execute(
            select(StudentMembership)
            .where(StudentMembership.student_id == student_id)
            .order_by(StudentMembership.enrolled_at.desc())
        )
        return list(result.scalars().all())

    async def create_membership(self, membership: StudentMembership) -> StudentMembership:
        self.session.add(membership)
        await self.session.flush()
        await self.session.refresh(membership)
        return membership

    async def list_parents(self, student_id: UUID) -> list[ParentStudent]:
        result = await self.session.execute(
            select(ParentStudent).where(ParentStudent.student_id == student_id)
        )
        return list(result.scalars().all())

    async def get_parent_link(
        self, user_id: UUID, student_id: UUID
    ) -> ParentStudent | None:
        result = await self.session.execute(
            select(ParentStudent).where(
                ParentStudent.user_id == user_id,
                ParentStudent.student_id == student_id,
            )
        )
        return result.scalar_one_or_none()

    async def create_parent_link(self, link: ParentStudent) -> ParentStudent:
        self.session.add(link)
        await self.session.flush()
        await self.session.refresh(link)
        return link

    async def get_active_tenant_by_id(self, tenant_id: UUID) -> Tenant | None:
        result = await self.session.execute(
            select(Tenant).where(Tenant.id == tenant_id, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_active_tenant_by_slug(self, slug: str) -> Tenant | None:
        result = await self.session.execute(
            select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def get_active_tenant_by_code(self, code: str) -> Tenant | None:
        result = await self.session.execute(
            select(Tenant).where(Tenant.code == code, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def list_upcoming_sessions_for_student(
        self, student_id: UUID, tenant_id: UUID, now, limit: int
    ) -> list[ClassroomSession]:
        result = await self.session.execute(
            select(ClassroomSession)
            .join(
                ClassroomStudent,
                ClassroomSession.classroom_id == ClassroomStudent.classroom_id,
            )
            .where(
                ClassroomStudent.student_id == student_id,
                ClassroomSession.tenant_id == tenant_id,
                ClassroomSession.session_start > now,
                ClassroomSession.status != "canceled",
            )
            .order_by(ClassroomSession.session_start.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_active_sessions_for_student(
        self, student_id: UUID, tenant_id: UUID, now, limit: int
    ) -> list[ClassroomSession]:
        result = await self.session.execute(
            select(ClassroomSession)
            .join(
                ClassroomStudent,
                ClassroomSession.classroom_id == ClassroomStudent.classroom_id,
            )
            .where(
                ClassroomStudent.student_id == student_id,
                ClassroomSession.tenant_id == tenant_id,
                ClassroomSession.session_start <= now,
                ClassroomSession.session_end >= now,
                ClassroomSession.status != "canceled",
                ClassroomSession.status != "completed",
            )
            .order_by(ClassroomSession.session_start.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_classrooms_for_student(
        self, student_id: UUID, tenant_id: UUID
    ) -> list[Classroom]:
        result = await self.session.execute(
            select(Classroom)
            .join(ClassroomStudent, Classroom.id == ClassroomStudent.classroom_id)
            .where(
                ClassroomStudent.student_id == student_id,
                Classroom.tenant_id == tenant_id,
                Classroom.is_active == True,
            )
            .order_by(Classroom.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_classroom_for_student(
        self, *, classroom_id: UUID, student_id: UUID, tenant_id: UUID
    ) -> Classroom | None:
        result = await self.session.execute(
            select(Classroom)
            .join(ClassroomStudent, Classroom.id == ClassroomStudent.classroom_id)
            .where(
                Classroom.id == classroom_id,
                ClassroomStudent.student_id == student_id,
                Classroom.tenant_id == tenant_id,
                Classroom.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def list_classroom_sessions_for_student(
        self, *, classroom_id: UUID, tenant_id: UUID, limit: int
    ) -> list[ClassroomSession]:
        result = await self.session.execute(
            select(ClassroomSession)
            .where(
                ClassroomSession.classroom_id == classroom_id,
                ClassroomSession.tenant_id == tenant_id,
            )
            .order_by(ClassroomSession.session_start.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_session_for_student_classroom(
        self, *, classroom_id: UUID, session_id: UUID, tenant_id: UUID
    ) -> ClassroomSession | None:
        result = await self.session.execute(
            select(ClassroomSession).where(
                ClassroomSession.id == session_id,
                ClassroomSession.classroom_id == classroom_id,
                ClassroomSession.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_upcoming_sessions_for_parent_children(
        self, *, parent_user_id: UUID, tenant_id: UUID, now, limit: int
    ) -> list[ClassroomSession]:
        child_ids_subq = (
            select(ParentStudent.student_id)
            .where(ParentStudent.user_id == parent_user_id)
            .scalar_subquery()
        )
        result = await self.session.execute(
            select(ClassroomSession)
            .join(
                ClassroomStudent,
                ClassroomSession.classroom_id == ClassroomStudent.classroom_id,
            )
            .where(
                ClassroomStudent.student_id.in_(child_ids_subq),
                ClassroomSession.tenant_id == tenant_id,
                ClassroomSession.session_start > now,
                ClassroomSession.status != "canceled",
            )
            .order_by(ClassroomSession.session_start.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_submission_events_for_student(
        self, *, student_id: UUID, tenant_id: UUID, session_ids: list[UUID]
    ) -> list[ClassroomSessionEvent]:
        """Return the latest submission event per session for a given student."""
        if not session_ids:
            return []
        result = await self.session.execute(
            select(ClassroomSessionEvent)
            .where(
                ClassroomSessionEvent.session_id.in_(session_ids),
                ClassroomSessionEvent.tenant_id == tenant_id,
                ClassroomSessionEvent.actor_id == student_id,
                or_(
                    ClassroomSessionEvent.event_type == "student.submission.submitted",
                    ClassroomSessionEvent.event_type == "student.submission.saved",
                ),
            )
            .order_by(ClassroomSessionEvent.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_assignments_for_student(
        self, *, student_id: UUID, tenant_id: UUID, limit: int
    ) -> list[tuple[ClassroomSessionState, ClassroomSession, Classroom]]:
        result = await self.session.execute(
            select(ClassroomSessionState, ClassroomSession, Classroom)
            .join(
                ClassroomSession,
                ClassroomSessionState.session_id == ClassroomSession.id,
            )
            .join(
                Classroom,
                ClassroomSessionState.classroom_id == Classroom.id,
            )
            .join(
                ClassroomStudent,
                ClassroomStudent.classroom_id == ClassroomSessionState.classroom_id,
            )
            .where(
                ClassroomStudent.student_id == student_id,
                ClassroomSessionState.tenant_id == tenant_id,
                ClassroomSession.tenant_id == tenant_id,
                Classroom.tenant_id == tenant_id,
                Classroom.is_active == True,
                ClassroomSession.status != "canceled",
            )
            .order_by(ClassroomSession.session_start.desc())
            .limit(limit)
        )
        return list(result.all())
