"""Project and lab assignment repository."""

from uuid import UUID

from sqlalchemy import exists, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import ClassroomStudent
from app.students.models import ParentStudent, Student
from app.tenants.models import Tenant
from app.labs.models import LabAssignment, Project, SubmissionFeedback


class ProjectRepository:
    """Repository for project queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, project_id: UUID, tenant_id: UUID) -> Project | None:
        """Get project by ID within tenant."""
        result = await self.session.execute(
            select(Project).where(
                Project.id == project_id,
                Project.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_student(
        self,
        student_id: UUID,
        tenant_id: UUID,
        *,
        lab_id: UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Project]:
        """List projects for a student."""
        query = select(Project).where(
            Project.student_id == student_id,
            Project.tenant_id == tenant_id,
        )
        if lab_id is not None:
            query = query.where(Project.lab_id == lab_id)
        query = query.order_by(Project.submitted_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_by_session(
        self,
        tenant_id: UUID,
        session_id: str,
        *,
        classroom_id: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Project]:
        """List projects that were created during a classroom session."""
        from sqlalchemy import cast, String
        query = select(Project).where(
            Project.tenant_id == tenant_id,
            cast(Project.metadata_["session_id"].astext, String) == session_id,
        )
        if classroom_id:
            query = query.where(
                cast(Project.metadata_["classroom_id"].astext, String) == classroom_id,
            )
        query = query.order_by(Project.submitted_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def create(self, project: Project) -> Project:
        """Create a project."""
        self.session.add(project)
        await self.session.flush()
        await self.session.refresh(project)
        return project

    async def update(self, project: Project) -> Project:
        """Persist changes for an existing project."""
        await self.session.flush()
        await self.session.refresh(project)
        return project

    async def delete(self, project: Project) -> None:
        """Delete a project."""
        await self.session.delete(project)
        await self.session.flush()

    async def list_revisions(
        self,
        project_id: UUID,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[Project]:
        """List revision lineage: base project + derived checkpoints."""
        query = (
            select(Project)
            .where(
                Project.tenant_id == tenant_id,
                (Project.id == project_id) | (Project.source_project_id == project_id),
            )
            .order_by(Project.updated_at.desc(), Project.submitted_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_public_explore_candidates(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[tuple[Project, Student, dict | None]]:
        """List newest candidate public projects with creator + tenant settings.

        Filtering for published/public flags happens in service so we can support
        multiple metadata key shapes without hard-coding JSONB operators here.
        """
        blocked_parent_link = exists(
            select(1).where(
                ParentStudent.student_id == Project.student_id,
                ParentStudent.allow_public_game_publishing.is_(False),
            )
        )
        query = (
            select(Project, Student, Tenant.settings)
            .join(Student, Student.id == Project.student_id)
            .join(Tenant, Tenant.id == Project.tenant_id)
            .where(~blocked_parent_link)
            .order_by(Project.submitted_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.all())


class LabAssignmentRepository:
    """Repository for lab assignment queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, assignment: LabAssignment) -> LabAssignment:
        self.session.add(assignment)
        await self.session.flush()
        await self.session.refresh(assignment)
        return assignment

    async def get_by_id(self, assignment_id: UUID, tenant_id: UUID) -> LabAssignment | None:
        result = await self.session.execute(
            select(LabAssignment).where(
                LabAssignment.id == assignment_id,
                LabAssignment.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        student_id: UUID | None = None,
        classroom_id: UUID | None = None,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LabAssignment]:
        query = select(LabAssignment).where(LabAssignment.tenant_id == tenant_id)
        if student_id is not None:
            query = query.where(LabAssignment.student_id == student_id)
        if classroom_id is not None:
            query = query.where(LabAssignment.classroom_id == classroom_id)
        if status_filter is not None:
            query = query.where(LabAssignment.status == status_filter)
        query = query.order_by(LabAssignment.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_for_student(
        self,
        student_id: UUID,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LabAssignment]:
        """Get all assignments for a student: direct + classroom-level."""
        classroom_ids_subq = (
            select(ClassroomStudent.classroom_id)
            .where(ClassroomStudent.student_id == student_id)
            .scalar_subquery()
        )
        query = (
            select(LabAssignment)
            .where(
                LabAssignment.tenant_id == tenant_id,
                (
                    (LabAssignment.student_id == student_id)
                    | (LabAssignment.classroom_id.in_(classroom_ids_subq))
                ),
            )
            .order_by(LabAssignment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update(self, assignment: LabAssignment) -> LabAssignment:
        await self.session.flush()
        await self.session.refresh(assignment)
        return assignment

    async def delete(self, assignment: LabAssignment) -> None:
        await self.session.delete(assignment)
        await self.session.flush()


class FeedbackRepository:
    """Repository for submission feedback queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, feedback: SubmissionFeedback) -> SubmissionFeedback:
        self.session.add(feedback)
        await self.session.flush()
        await self.session.refresh(feedback)
        return feedback

    async def get_by_id(self, feedback_id: UUID, tenant_id: UUID) -> SubmissionFeedback | None:
        result = await self.session.execute(
            select(SubmissionFeedback).where(
                SubmissionFeedback.id == feedback_id,
                SubmissionFeedback.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_project(
        self, project_id: UUID, tenant_id: UUID
    ) -> list[SubmissionFeedback]:
        result = await self.session.execute(
            select(SubmissionFeedback)
            .where(
                SubmissionFeedback.project_id == project_id,
                SubmissionFeedback.tenant_id == tenant_id,
            )
            .order_by(SubmissionFeedback.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, feedback: SubmissionFeedback) -> SubmissionFeedback:
        await self.session.flush()
        await self.session.refresh(feedback)
        return feedback

    async def delete(self, feedback: SubmissionFeedback) -> None:
        await self.session.delete(feedback)
        await self.session.flush()
