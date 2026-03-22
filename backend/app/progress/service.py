"""Progress service."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity, TenantContext
from app.progress.models import LabProgress, LessonProgress

from .repository import LabProgressRepository, LessonProgressRepository, ProgressRepository
from .schemas import (
    LabProgressResponse,
    LabProgressUpdate,
    LessonProgressResponse,
    LessonProgressUpdate,
    ProgressSummary,
)


class ProgressService:
    """Service for progress operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.lesson_repo = LessonProgressRepository(session)
        self.lab_repo = LabProgressRepository(session)
        self.progress_repo = ProgressRepository(session)

    def _student_id(self, identity: CurrentIdentity, student_id: UUID | None) -> UUID:
        """Resolve student_id: identity.id if student, else require student_id param."""
        if identity.sub_type == "student":
            return identity.id
        if student_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="student_id required",
            )
        return student_id

    async def update_lesson_progress(
        self,
        lesson_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        data: LessonProgressUpdate,
    ) -> LessonProgressResponse:
        """Create or update lesson progress."""
        student_id = self._student_id(identity, None)
        existing = await self.lesson_repo.get(
            student_id, lesson_id, tenant_ctx.tenant_id
        )
        if existing:
            for k, v in data.model_dump(exclude_unset=True).items():
                setattr(existing, k, v)
            progress = await self.lesson_repo.upsert(existing)
        else:
            progress = LessonProgress(
                student_id=student_id,
                lesson_id=lesson_id,
                tenant_id=tenant_ctx.tenant_id,
                status=data.status,
                score=data.score,
                time_spent_seconds=data.time_spent_seconds,
                completed_at=data.completed_at,
            )
            progress = await self.lesson_repo.upsert(progress)
        return LessonProgressResponse.model_validate(progress)

    async def get_lesson_progress(
        self,
        lesson_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        student_id: UUID | None = None,
    ) -> LessonProgressResponse | None:
        """Get lesson progress."""
        sid = self._student_id(identity, student_id)
        progress = await self.lesson_repo.get(sid, lesson_id, tenant_ctx.tenant_id)
        return LessonProgressResponse.model_validate(progress) if progress else None

    async def update_lab_progress(
        self,
        lab_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        data: LabProgressUpdate,
    ) -> LabProgressResponse:
        """Create or update lab progress."""
        student_id = self._student_id(identity, None)
        existing = await self.lab_repo.get(
            student_id, lab_id, tenant_ctx.tenant_id
        )
        if existing:
            for k, v in data.model_dump(exclude_unset=True).items():
                setattr(existing, k, v)
            progress = await self.lab_repo.upsert(existing)
        else:
            progress = LabProgress(
                student_id=student_id,
                lab_id=lab_id,
                tenant_id=tenant_ctx.tenant_id,
                status=data.status,
                score=data.score,
                time_spent_seconds=data.time_spent_seconds,
                state_snapshot=data.state_snapshot,
                completed_at=data.completed_at,
            )
            progress = await self.lab_repo.upsert(progress)
        return LabProgressResponse.model_validate(progress)

    async def get_lab_progress(
        self,
        lab_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        student_id: UUID | None = None,
    ) -> LabProgressResponse | None:
        """Get lab progress."""
        sid = self._student_id(identity, student_id)
        progress = await self.lab_repo.get(sid, lab_id, tenant_ctx.tenant_id)
        return LabProgressResponse.model_validate(progress) if progress else None

    async def get_student_summary(
        self,
        student_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ProgressSummary:
        """Get progress dashboard summary for a student."""
        sid = self._student_id(identity, student_id)
        if identity.sub_type == "student" and student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own progress",
            )
        lesson_progress = await self.lesson_repo.list_by_student(
            sid, tenant_ctx.tenant_id
        )
        lab_progress = await self.lab_repo.list_by_student(
            sid, tenant_ctx.tenant_id
        )
        lessons_total = await self.progress_repo.count_lessons_for_tenant(
            tenant_ctx.tenant_id
        )
        labs_total = await self.progress_repo.count_labs_for_tenant(
            tenant_ctx.tenant_id
        )
        lessons_completed = sum(
            1 for p in lesson_progress if p.status == "completed"
        )
        labs_completed = sum(
            1 for p in lab_progress if p.status == "completed"
        )
        total_time = sum(p.time_spent_seconds for p in lesson_progress) + sum(
            p.time_spent_seconds for p in lab_progress
        )
        return ProgressSummary(
            student_id=sid,
            tenant_id=tenant_ctx.tenant_id,
            lessons_completed=lessons_completed,
            lessons_total=lessons_total,
            labs_completed=labs_completed,
            labs_total=labs_total,
            total_time_spent_seconds=total_time,
            lesson_progress=[LessonProgressResponse.model_validate(p) for p in lesson_progress],
            lab_progress=[LabProgressResponse.model_validate(p) for p in lab_progress],
        )
