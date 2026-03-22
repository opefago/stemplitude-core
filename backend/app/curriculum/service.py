from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom
from app.curriculum.models import Course, Module, Lesson, Lab


class CurriculumService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Courses ---

    async def create_course(self, tenant_id: UUID, data: dict) -> Course:
        course = Course(tenant_id=tenant_id, **data)
        self.db.add(course)
        await self.db.flush()
        return course

    async def list_courses(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_published: bool | None = None,
        program_id: UUID | None = None,
    ) -> list[Course]:
        query = select(Course).where(Course.tenant_id == tenant_id)
        if is_published is not None:
            query = query.where(Course.is_published == is_published)
        if program_id is not None:
            query = query.where(Course.program_id == program_id)
        result = await self.db.execute(
            query.order_by(Course.sort_order).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def get_course(self, course_id: UUID, tenant_id: UUID) -> Course:
        result = await self.db.execute(
            select(Course).where(Course.id == course_id, Course.tenant_id == tenant_id)
        )
        course = result.scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        return course

    async def update_course(self, course_id: UUID, tenant_id: UUID, data: dict) -> Course:
        course = await self.get_course(course_id, tenant_id)
        for k, v in data.items():
            if v is not None:
                setattr(course, k, v)
        await self.db.flush()
        return course

    async def delete_course(self, course_id: UUID, tenant_id: UUID) -> None:
        course = await self.get_course(course_id, tenant_id)
        linked_count_result = await self.db.execute(
            select(func.count(Classroom.id)).where(
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
                Classroom.curriculum_id == course_id,
            )
        )
        linked_count = int(linked_count_result.scalar_one() or 0)
        if linked_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Curriculum is linked to active classes. Reassign classes before delete.",
            )
        await self.db.delete(course)
        await self.db.flush()

    async def bulk_assign_program(
        self,
        *,
        tenant_id: UUID,
        course_ids: list[UUID],
        program_id: UUID | None,
    ) -> int:
        if not course_ids:
            return 0
        result = await self.db.execute(
            update(Course)
            .where(
                Course.tenant_id == tenant_id,
                Course.id.in_(course_ids),
            )
            .values(program_id=program_id)
        )
        await self.db.flush()
        return int(result.rowcount or 0)

    # --- Modules ---

    async def create_module(self, course_id: UUID, tenant_id: UUID, data: dict) -> Module:
        await self.get_course(course_id, tenant_id)
        module = Module(course_id=course_id, **data)
        self.db.add(module)
        await self.db.flush()
        return module

    async def list_modules(self, course_id: UUID) -> list[Module]:
        result = await self.db.execute(
            select(Module).where(Module.course_id == course_id).order_by(Module.sort_order)
        )
        return list(result.scalars().all())

    async def update_module(self, module_id: UUID, data: dict) -> Module:
        result = await self.db.execute(select(Module).where(Module.id == module_id))
        module = result.scalar_one_or_none()
        if not module:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        for k, v in data.items():
            if v is not None:
                setattr(module, k, v)
        await self.db.flush()
        return module

    async def delete_module(self, module_id: UUID) -> None:
        result = await self.db.execute(select(Module).where(Module.id == module_id))
        module = result.scalar_one_or_none()
        if not module:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        await self.db.delete(module)

    # --- Lessons ---

    async def create_lesson(self, module_id: UUID, data: dict) -> Lesson:
        lesson = Lesson(module_id=module_id, **data)
        self.db.add(lesson)
        await self.db.flush()
        return lesson

    async def list_lessons(self, module_id: UUID) -> list[Lesson]:
        result = await self.db.execute(
            select(Lesson).where(Lesson.module_id == module_id).order_by(Lesson.sort_order)
        )
        return list(result.scalars().all())

    async def update_lesson(self, lesson_id: UUID, data: dict) -> Lesson:
        result = await self.db.execute(select(Lesson).where(Lesson.id == lesson_id))
        lesson = result.scalar_one_or_none()
        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        for k, v in data.items():
            if v is not None:
                setattr(lesson, k, v)
        await self.db.flush()
        return lesson

    async def delete_lesson(self, lesson_id: UUID) -> None:
        result = await self.db.execute(select(Lesson).where(Lesson.id == lesson_id))
        lesson = result.scalar_one_or_none()
        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        await self.db.delete(lesson)

    # --- Labs ---

    async def create_lab(self, lesson_id: UUID, data: dict) -> Lab:
        lab = Lab(lesson_id=lesson_id, **data)
        self.db.add(lab)
        await self.db.flush()
        return lab

    async def list_labs(self, lesson_id: UUID) -> list[Lab]:
        result = await self.db.execute(
            select(Lab).where(Lab.lesson_id == lesson_id)
        )
        return list(result.scalars().all())

    async def update_lab(self, lab_id: UUID, data: dict) -> Lab:
        result = await self.db.execute(select(Lab).where(Lab.id == lab_id))
        lab = result.scalar_one_or_none()
        if not lab:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
        for k, v in data.items():
            if v is not None:
                setattr(lab, k, v)
        await self.db.flush()
        return lab

    async def delete_lab(self, lab_id: UUID) -> None:
        result = await self.db.execute(select(Lab).where(Lab.id == lab_id))
        lab = result.scalar_one_or_none()
        if not lab:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
        await self.db.delete(lab)
