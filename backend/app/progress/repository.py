"""Progress repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.curriculum.models import Lab, Lesson
from app.progress.models import LabProgress, LessonProgress


class LessonProgressRepository:
    """Repository for lesson progress."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(
        self, student_id: UUID, lesson_id: UUID, tenant_id: UUID
    ) -> LessonProgress | None:
        result = await self.session.execute(
            select(LessonProgress).where(
                LessonProgress.student_id == student_id,
                LessonProgress.lesson_id == lesson_id,
                LessonProgress.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(self, progress: LessonProgress) -> LessonProgress:
        self.session.add(progress)
        await self.session.flush()
        await self.session.refresh(progress)
        return progress

    async def list_by_student(
        self, student_id: UUID, tenant_id: UUID
    ) -> list[LessonProgress]:
        result = await self.session.execute(
            select(LessonProgress)
            .where(
                LessonProgress.student_id == student_id,
                LessonProgress.tenant_id == tenant_id,
            )
            .order_by(LessonProgress.lesson_id)
        )
        return list(result.scalars().all())


class LabProgressRepository:
    """Repository for lab progress."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(
        self, student_id: UUID, lab_id: UUID, tenant_id: UUID
    ) -> LabProgress | None:
        result = await self.session.execute(
            select(LabProgress).where(
                LabProgress.student_id == student_id,
                LabProgress.lab_id == lab_id,
                LabProgress.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(self, progress: LabProgress) -> LabProgress:
        self.session.add(progress)
        await self.session.flush()
        await self.session.refresh(progress)
        return progress

    async def list_by_student(
        self, student_id: UUID, tenant_id: UUID
    ) -> list[LabProgress]:
        result = await self.session.execute(
            select(LabProgress)
            .where(
                LabProgress.student_id == student_id,
                LabProgress.tenant_id == tenant_id,
            )
            .order_by(LabProgress.lab_id)
        )
        return list(result.scalars().all())


class ProgressRepository:
    """Combined progress repository for dashboard queries."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.lesson_repo = LessonProgressRepository(session)
        self.lab_repo = LabProgressRepository(session)

    async def count_lessons_for_tenant(self, tenant_id: UUID) -> int:
        """Count total lessons (tenant courses + global)."""
        from app.curriculum.models import Course, Module
        from sqlalchemy import or_

        result = await self.session.execute(
            select(func.count(Lesson.id))
            .select_from(Lesson)
            .join(Module, Lesson.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .where(or_(Course.tenant_id == tenant_id, Course.tenant_id.is_(None)))
        )
        return result.scalar() or 0

    async def count_labs_for_tenant(self, tenant_id: UUID) -> int:
        """Count total labs for tenant (via curriculum)."""
        from app.curriculum.models import Course, Module
        from sqlalchemy import or_

        result = await self.session.execute(
            select(func.count(Lab.id))
            .select_from(Lab)
            .join(Lesson, Lab.lesson_id == Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .where(or_(Course.tenant_id == tenant_id, Course.tenant_id.is_(None)))
        )
        return result.scalar() or 0
