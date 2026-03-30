from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom
from app.curriculum.models import Course, Module, Lesson, Lab
from app.tenants.franchise_governance import (
    child_may_author_curriculum,
    curriculum_read_tenant_ids,
)


class CurriculumService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _read_tenant_ids(
        self,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None,
        governance_mode: str | None,
    ) -> list[UUID]:
        return curriculum_read_tenant_ids(
            child_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
        )

    async def _get_course_read(
        self, course_id: UUID, read_tenant_ids: list[UUID]
    ) -> Course:
        result = await self.db.execute(
            select(Course).where(
                Course.id == course_id,
                Course.tenant_id.in_(read_tenant_ids),
            )
        )
        course = result.scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        return course

    def _assert_course_writable(
        self,
        course: Course,
        workspace_tenant_id: UUID,
        governance_mode: str | None,
    ) -> None:
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
        if course.tenant_id != workspace_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify parent organization's curriculum.",
            )

    async def _get_course_write(
        self,
        course_id: UUID,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None,
        governance_mode: str | None,
    ) -> Course:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        course = await self._get_course_read(course_id, read_ids)
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        return course

    async def _module_and_course(self, module_id: UUID) -> tuple[Module, Course] | None:
        result = await self.db.execute(
            select(Module, Course)
            .join(Course, Module.course_id == Course.id)
            .where(Module.id == module_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        return row[0], row[1]

    async def _lesson_module_course(self, lesson_id: UUID) -> tuple[Lesson, Module, Course] | None:
        result = await self.db.execute(
            select(Lesson, Module, Course)
            .join(Module, Lesson.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .where(Lesson.id == lesson_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        return row[0], row[1], row[2]

    async def _lab_lesson_chain(self, lab_id: UUID) -> tuple[Lab, Lesson, Module, Course] | None:
        result = await self.db.execute(
            select(Lab, Lesson, Module, Course)
            .join(Lesson, Lab.lesson_id == Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .where(Lab.id == lab_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        return row[0], row[1], row[2], row[3]

    # --- Courses ---

    async def create_course(
        self,
        tenant_id: UUID,
        data: dict,
        *,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Course:
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
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
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> list[Course]:
        read_ids = self._read_tenant_ids(tenant_id, parent_tenant_id, governance_mode)
        query = select(Course).where(Course.tenant_id.in_(read_ids))
        if is_published is not None:
            query = query.where(Course.is_published == is_published)
        if program_id is not None:
            query = query.where(Course.program_id == program_id)
        result = await self.db.execute(
            query.order_by(Course.tenant_id, Course.sort_order).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def get_course(
        self,
        course_id: UUID,
        tenant_id: UUID,
        *,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Course:
        read_ids = self._read_tenant_ids(tenant_id, parent_tenant_id, governance_mode)
        return await self._get_course_read(course_id, read_ids)

    async def update_course(
        self,
        course_id: UUID,
        tenant_id: UUID,
        data: dict,
        *,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Course:
        course = await self._get_course_write(
            course_id, tenant_id, parent_tenant_id, governance_mode
        )
        for k, v in data.items():
            if v is not None:
                setattr(course, k, v)
        await self.db.flush()
        return course

    async def delete_course(
        self,
        course_id: UUID,
        tenant_id: UUID,
        *,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        course = await self._get_course_write(
            course_id, tenant_id, parent_tenant_id, governance_mode
        )
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
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> int:
        if not course_ids:
            return 0
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
        read_ids = self._read_tenant_ids(tenant_id, parent_tenant_id, governance_mode)
        result = await self.db.execute(select(Course.id, Course.tenant_id).where(Course.id.in_(course_ids)))
        rows = result.all()
        found = {r[0]: r[1] for r in rows}
        for cid in course_ids:
            tid = found.get(cid)
            if tid is None or tid not in read_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="One or more courses were not found in this workspace",
                )
            if tid != tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot modify parent organization's curriculum.",
                )
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

    async def create_module(
        self,
        course_id: UUID,
        tenant_id: UUID,
        data: dict,
        *,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Module:
        await self._get_course_write(course_id, tenant_id, parent_tenant_id, governance_mode)
        module = Module(course_id=course_id, **data)
        self.db.add(module)
        await self.db.flush()
        return module

    async def list_modules(
        self,
        course_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> list[Module]:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        await self._get_course_read(course_id, read_ids)
        result = await self.db.execute(
            select(Module).where(Module.course_id == course_id).order_by(Module.sort_order)
        )
        return list(result.scalars().all())

    async def update_module(
        self,
        module_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Module:
        row = await self._module_and_course(module_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        module, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        for k, v in data.items():
            if v is not None:
                setattr(module, k, v)
        await self.db.flush()
        return module

    async def delete_module(
        self,
        module_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        row = await self._module_and_course(module_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        module, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        await self.db.delete(module)
        await self.db.flush()

    # --- Lessons ---

    async def create_lesson(
        self,
        module_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Lesson:
        row = await self._module_and_course(module_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        _module, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        lesson = Lesson(module_id=module_id, **data)
        self.db.add(lesson)
        await self.db.flush()
        return lesson

    async def list_lessons(
        self,
        module_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> list[Lesson]:
        row = await self._module_and_course(module_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        _module, course = row
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        if course.tenant_id not in read_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        result = await self.db.execute(
            select(Lesson).where(Lesson.module_id == module_id).order_by(Lesson.sort_order)
        )
        return list(result.scalars().all())

    async def update_lesson(
        self,
        lesson_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Lesson:
        row = await self._lesson_module_course(lesson_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        lesson, _mod, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        for k, v in data.items():
            if v is not None:
                setattr(lesson, k, v)
        await self.db.flush()
        return lesson

    async def delete_lesson(
        self,
        lesson_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        row = await self._lesson_module_course(lesson_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        lesson, _mod, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        await self.db.delete(lesson)
        await self.db.flush()

    # --- Labs ---

    async def create_lab(
        self,
        lesson_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Lab:
        row = await self._lesson_module_course(lesson_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        _lesson, _mod, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        lab = Lab(lesson_id=lesson_id, **data)
        self.db.add(lab)
        await self.db.flush()
        return lab

    async def list_labs(
        self,
        lesson_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> list[Lab]:
        row = await self._lesson_module_course(lesson_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        _lesson, _mod, course = row
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        if course.tenant_id not in read_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        result = await self.db.execute(select(Lab).where(Lab.lesson_id == lesson_id))
        return list(result.scalars().all())

    async def update_lab(
        self,
        lab_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> Lab:
        row = await self._lab_lesson_chain(lab_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
        lab, _les, _mod, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        for k, v in data.items():
            if v is not None:
                setattr(lab, k, v)
        await self.db.flush()
        return lab

    async def delete_lab(
        self,
        lab_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        row = await self._lab_lesson_chain(lab_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
        lab, _les, _mod, course = row
        self._assert_course_writable(course, workspace_tenant_id, governance_mode)
        await self.db.delete(lab)
        await self.db.flush()
