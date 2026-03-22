"""Curriculum repository."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.curriculum.models import Course, Lab, Lesson, Module


class CourseRepository:
    """Repository for course queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(
        self, course_id: UUID, tenant_id: UUID | None = None
    ) -> Course | None:
        """Get course by ID, optionally scoped by tenant."""
        query = select(Course).where(Course.id == course_id)
        if tenant_id is not None:
            query = query.where(Course.tenant_id == tenant_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_published: bool | None = None,
    ) -> list[Course]:
        """List courses for a tenant."""
        query = select(Course).where(Course.tenant_id == tenant_id)
        if is_published is not None:
            query = query.where(Course.is_published == is_published)
        query = query.order_by(Course.sort_order, Course.title).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())


class ModuleRepository:
    """Repository for module queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, module_id: UUID) -> Module | None:
        """Get module by ID."""
        result = await self.session.execute(
            select(Module).where(Module.id == module_id)
        )
        return result.scalar_one_or_none()

    async def list_by_course(self, course_id: UUID) -> list[Module]:
        """List modules for a course."""
        result = await self.session.execute(
            select(Module)
            .where(Module.course_id == course_id)
            .order_by(Module.sort_order, Module.title)
        )
        return list(result.scalars().all())


class LessonRepository:
    """Repository for lesson queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, lesson_id: UUID) -> Lesson | None:
        """Get lesson by ID."""
        result = await self.session.execute(
            select(Lesson).where(Lesson.id == lesson_id)
        )
        return result.scalar_one_or_none()

    async def list_by_module(self, module_id: UUID) -> list[Lesson]:
        """List lessons for a module."""
        result = await self.session.execute(
            select(Lesson)
            .where(Lesson.module_id == module_id)
            .order_by(Lesson.sort_order, Lesson.title)
        )
        return list(result.scalars().all())


class LabRepository:
    """Repository for lab queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, lab_id: UUID) -> Lab | None:
        """Get lab by ID."""
        result = await self.session.execute(select(Lab).where(Lab.id == lab_id))
        return result.scalar_one_or_none()

    async def list_by_lesson(self, lesson_id: UUID) -> list[Lab]:
        """List labs for a lesson."""
        result = await self.session.execute(
            select(Lab)
            .where(Lab.lesson_id == lesson_id)
            .order_by(Lab.title)
        )
        return list(result.scalars().all())
