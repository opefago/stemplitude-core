from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom
from app.curriculum.models import AssignmentTemplate, Course, Lab, Lesson, Module, RubricTemplate
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
        await self._validate_course_assignment_template_ids(
            workspace_tenant_id=tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
            assignment_template_ids=data.get("assignment_template_ids"),
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
        if "assignment_template_ids" in data:
            await self._validate_course_assignment_template_ids(
                workspace_tenant_id=tenant_id,
                parent_tenant_id=parent_tenant_id,
                governance_mode=governance_mode,
                assignment_template_ids=data.get("assignment_template_ids"),
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

    def _assert_curriculum_artifact_writable(
        self,
        artifact_tenant_id: UUID,
        workspace_tenant_id: UUID,
        governance_mode: str | None,
    ) -> None:
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
        if artifact_tenant_id != workspace_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify another workspace's curriculum.",
            )

    # --- Rubric templates ---

    def _criteria_json(self, rows: list | None) -> list[dict]:
        if not rows:
            return []
        out: list[dict] = []
        for item in rows:
            if hasattr(item, "model_dump"):
                d = item.model_dump()
            elif isinstance(item, dict):
                d = item
            else:
                continue
            cid = str(d.get("criterion_id") or "").strip()
            if not cid:
                continue
            try:
                mx = int(d.get("max_points"))
            except (TypeError, ValueError):
                continue
            if mx < 1 or mx > 1000:
                continue
            label = d.get("label")
            desc = d.get("description")
            crit_row: dict = {"criterion_id": cid[:80], "max_points": mx}
            if isinstance(label, str) and label.strip():
                crit_row["label"] = label.strip()[:200]
            if isinstance(desc, str) and desc.strip():
                crit_row["description"] = desc.strip()[:500]
            out.append(crit_row)
        return out

    async def create_rubric_template(
        self,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> RubricTemplate:
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
        crit = self._criteria_json(data.get("criteria"))
        row = RubricTemplate(
            tenant_id=workspace_tenant_id,
            title=str(data["title"]).strip()[:200],
            description=(str(data["description"]).strip()[:1000] if data.get("description") else None),
            criteria=crit,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def list_rubric_templates(
        self,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[RubricTemplate]:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        result = await self.db.execute(
            select(RubricTemplate)
            .where(RubricTemplate.tenant_id.in_(read_ids))
            .order_by(RubricTemplate.title.asc())
            .offset(skip)
            .limit(min(limit, 500))
        )
        return list(result.scalars().all())

    async def get_rubric_template(
        self,
        template_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> RubricTemplate:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        row = await self.db.get(RubricTemplate, template_id)
        if row is None or row.tenant_id not in read_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rubric template not found")
        return row

    async def update_rubric_template(
        self,
        template_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> RubricTemplate:
        row = await self.get_rubric_template(
            template_id,
            workspace_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
        )
        self._assert_curriculum_artifact_writable(
            row.tenant_id, workspace_tenant_id, governance_mode
        )
        if "title" in data and data["title"] is not None:
            row.title = str(data["title"]).strip()[:200]
        if "description" in data:
            row.description = (
                str(data["description"]).strip()[:1000] if data.get("description") else None
            )
        if "criteria" in data and data["criteria"] is not None:
            row.criteria = self._criteria_json(data["criteria"])
        await self.db.flush()
        return row

    async def delete_rubric_template(
        self,
        template_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        row = await self.get_rubric_template(
            template_id,
            workspace_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
        )
        self._assert_curriculum_artifact_writable(
            row.tenant_id, workspace_tenant_id, governance_mode
        )
        await self.db.delete(row)
        await self.db.flush()

    async def _validate_assignment_template_refs(
        self,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None,
        governance_mode: str | None,
        course_id: UUID | None,
        lesson_id: UUID | None,
        lab_id: UUID | None,
        rubric_template_id: UUID | None,
    ) -> None:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        eff_course_id = course_id
        if lesson_id is not None:
            row = await self._lesson_module_course(lesson_id)
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
            _les, _mod, course = row
            if course.tenant_id not in read_ids:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
            if eff_course_id is not None and eff_course_id != course.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lesson_id does not belong to the given course_id",
                )
            eff_course_id = course.id
        elif course_id is not None:
            await self._get_course_read(course_id, read_ids)

        if lab_id is not None:
            chain = await self._lab_lesson_chain(lab_id)
            if not chain:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
            _lab, _les, _mod, course = chain
            if course.tenant_id not in read_ids:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found")
            if lesson_id is not None and _lab.lesson_id != lesson_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lab_id is not attached to the given lesson",
                )
            if (
                lesson_id is None
                and eff_course_id is not None
                and course.id != eff_course_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lab_id does not belong to the given course",
                )

        if rubric_template_id is not None:
            rt = await self.db.get(RubricTemplate, rubric_template_id)
            if rt is None or rt.tenant_id not in read_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Rubric template not found"
                )

    async def _validate_course_assignment_template_ids(
        self,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None,
        governance_mode: str | None,
        assignment_template_ids: list[UUID] | None,
    ) -> None:
        if assignment_template_ids is None:
            return
        if not assignment_template_ids:
            return
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        result = await self.db.execute(
            select(AssignmentTemplate.id, AssignmentTemplate.tenant_id).where(
                AssignmentTemplate.id.in_(assignment_template_ids)
            )
        )
        found = {row[0]: row[1] for row in result.all()}
        for template_id in assignment_template_ids:
            tenant_id = found.get(template_id)
            if tenant_id is None or tenant_id not in read_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Assignment template not found: {template_id}",
                )

    async def create_assignment_template(
        self,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> AssignmentTemplate:
        if not child_may_author_curriculum(governance_mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Curriculum authoring is disabled for this franchise policy.",
            )
        course_id = data.get("course_id")
        lesson_id = data.get("lesson_id")
        lab_id = data.get("lab_id")
        rubric_template_id = data.get("rubric_template_id")
        await self._validate_assignment_template_refs(
            workspace_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
            course_id=course_id,
            lesson_id=lesson_id,
            lab_id=lab_id,
            rubric_template_id=rubric_template_id,
        )
        lrow = await self._lesson_module_course(lesson_id) if lesson_id else None
        resolved_course_id = course_id
        if lrow:
            _l, _m, course = lrow
            resolved_course_id = course.id

        tmpl = AssignmentTemplate(
            tenant_id=workspace_tenant_id,
            course_id=resolved_course_id,
            lesson_id=lesson_id,
            title=str(data["title"]).strip()[:200],
            instructions=str(data["instructions"]).strip() if data.get("instructions") else None,
            lab_id=lab_id,
            rubric_template_id=rubric_template_id,
            use_rubric=bool(data.get("use_rubric", True)),
            requires_lab=bool(data.get("requires_lab", False)),
            requires_assets=bool(data.get("requires_assets", False)),
            allow_edit_after_submit=bool(data.get("allow_edit_after_submit", False)),
            sort_order=int(data.get("sort_order") or 0),
        )
        self.db.add(tmpl)
        await self.db.flush()
        return tmpl

    async def list_assignment_templates(
        self,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AssignmentTemplate]:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        q = select(AssignmentTemplate).where(AssignmentTemplate.tenant_id.in_(read_ids))
        if lesson_id is not None:
            lrow = await self._lesson_module_course(lesson_id)
            if not lrow:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
            _les, _mod, course = lrow
            if course.tenant_id not in read_ids:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
            cid = course.id
            q = q.where(
                or_(
                    AssignmentTemplate.lesson_id == lesson_id,
                    and_(
                        AssignmentTemplate.lesson_id.is_(None),
                        or_(
                            AssignmentTemplate.course_id.is_(None),
                            AssignmentTemplate.course_id == cid,
                        ),
                    ),
                )
            )
        elif course_id is not None:
            q = q.where(
                or_(
                    AssignmentTemplate.course_id == course_id,
                    AssignmentTemplate.course_id.is_(None),
                )
            )
        q = q.order_by(AssignmentTemplate.sort_order, AssignmentTemplate.title).offset(skip).limit(
            min(limit, 500)
        )
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get_assignment_template(
        self,
        template_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> AssignmentTemplate:
        read_ids = self._read_tenant_ids(workspace_tenant_id, parent_tenant_id, governance_mode)
        row = await self.db.get(AssignmentTemplate, template_id)
        if row is None or row.tenant_id not in read_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment template not found"
            )
        return row

    async def update_assignment_template(
        self,
        template_id: UUID,
        data: dict,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> AssignmentTemplate:
        row = await self.get_assignment_template(
            template_id,
            workspace_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
        )
        self._assert_curriculum_artifact_writable(
            row.tenant_id, workspace_tenant_id, governance_mode
        )
        course_id = data.get("course_id", row.course_id)
        lesson_id = data.get("lesson_id", row.lesson_id)
        lab_id = data.get("lab_id", row.lab_id)
        rubric_template_id = data.get("rubric_template_id", row.rubric_template_id)
        if any(k in data for k in ("course_id", "lesson_id", "lab_id", "rubric_template_id")):
            await self._validate_assignment_template_refs(
                workspace_tenant_id=workspace_tenant_id,
                parent_tenant_id=parent_tenant_id,
                governance_mode=governance_mode,
                course_id=course_id,
                lesson_id=lesson_id,
                lab_id=lab_id,
                rubric_template_id=rubric_template_id,
            )
        row_lesson = await self._lesson_module_course(lesson_id) if lesson_id else None
        if row_lesson:
            _l, _m, course = row_lesson
            row.course_id = course.id
        elif "course_id" in data:
            row.course_id = course_id

        if "lesson_id" in data:
            row.lesson_id = lesson_id
        if "lab_id" in data:
            row.lab_id = lab_id
        if "rubric_template_id" in data:
            row.rubric_template_id = rubric_template_id
        if "title" in data and data["title"] is not None:
            row.title = str(data["title"]).strip()[:200]
        if "instructions" in data:
            row.instructions = (
                str(data["instructions"]).strip() if data.get("instructions") else None
            )
        if "use_rubric" in data and data["use_rubric"] is not None:
            row.use_rubric = bool(data["use_rubric"])
        if "requires_lab" in data and data["requires_lab"] is not None:
            row.requires_lab = bool(data["requires_lab"])
        if "requires_assets" in data and data["requires_assets"] is not None:
            row.requires_assets = bool(data["requires_assets"])
        if "allow_edit_after_submit" in data and data["allow_edit_after_submit"] is not None:
            row.allow_edit_after_submit = bool(data["allow_edit_after_submit"])
        if "sort_order" in data and data["sort_order"] is not None:
            row.sort_order = int(data["sort_order"])
        await self.db.flush()
        return row

    async def delete_assignment_template(
        self,
        template_id: UUID,
        *,
        workspace_tenant_id: UUID,
        parent_tenant_id: UUID | None = None,
        governance_mode: str | None = None,
    ) -> None:
        row = await self.get_assignment_template(
            template_id,
            workspace_tenant_id=workspace_tenant_id,
            parent_tenant_id=parent_tenant_id,
            governance_mode=governance_mode,
        )
        self._assert_curriculum_artifact_writable(
            row.tenant_id, workspace_tenant_id, governance_mode
        )
        await self.db.delete(row)
        await self.db.flush()
