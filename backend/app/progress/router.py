"""Progress router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context

from .schemas import (
    LabProgressResponse,
    LabProgressUpdate,
    LessonProgressResponse,
    LessonProgressUpdate,
    ProgressSummary,
)
from .service import ProgressService

router = APIRouter(tags=["Progress"])


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""
    from app.dependencies import get_tenant_context

    return Depends(get_tenant_context)


@router.post(
    "/lessons/{lesson_id}",
    response_model=LessonProgressResponse,
    dependencies=[_require_tenant(), require_permission("progress", "create")],
)
async def update_lesson_progress(
    lesson_id: UUID,
    data: LessonProgressUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update lesson progress."""
    service = ProgressService(db)
    return await service.update_lesson_progress(
        lesson_id=lesson_id,
        identity=identity,
        tenant_ctx=tenant,
        data=data,
    )


@router.get(
    "/lessons/{lesson_id}",
    response_model=LessonProgressResponse | None,
    dependencies=[_require_tenant(), require_permission("progress", "view")],
)
async def get_lesson_progress(
    lesson_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    student_id: UUID | None = Query(None),
):
    """Get lesson progress."""
    service = ProgressService(db)
    return await service.get_lesson_progress(
        lesson_id=lesson_id,
        identity=identity,
        tenant_ctx=tenant,
        student_id=student_id,
    )


@router.post(
    "/labs/{lab_id}",
    response_model=LabProgressResponse,
    dependencies=[_require_tenant(), require_permission("progress", "create")],
)
async def update_lab_progress(
    lab_id: UUID,
    data: LabProgressUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update lab progress."""
    service = ProgressService(db)
    return await service.update_lab_progress(
        lab_id=lab_id,
        identity=identity,
        tenant_ctx=tenant,
        data=data,
    )


@router.get(
    "/labs/{lab_id}",
    response_model=LabProgressResponse | None,
    dependencies=[_require_tenant(), require_permission("progress", "view")],
)
async def get_lab_progress(
    lab_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    student_id: UUID | None = Query(None),
):
    """Get lab progress."""
    service = ProgressService(db)
    return await service.get_lab_progress(
        lab_id=lab_id,
        identity=identity,
        tenant_ctx=tenant,
        student_id=student_id,
    )


@router.get(
    "/students/{student_id}/summary",
    response_model=ProgressSummary,
    dependencies=[_require_tenant(), require_permission("progress", "view")],
)
async def get_student_summary(
    student_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get progress dashboard for a student."""
    service = ProgressService(db)
    return await service.get_student_summary(
        student_id=student_id,
        identity=identity,
        tenant_ctx=tenant,
    )
