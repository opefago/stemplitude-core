"""Curriculum router."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.curriculum.schemas import (
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    LabCreate,
    LabResponse,
    LabUpdate,
    CurriculumBulkAssignProgramRequest,
    CurriculumBulkAssignProgramResponse,
    LessonCreate,
    LessonResponse,
    LessonUpdate,
    ModuleCreate,
    ModuleResponse,
    ModuleUpdate,
)
from app.curriculum.service import CurriculumService

router = APIRouter()


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""

    async def _get(request: Request) -> TenantContext:
        return get_tenant_context(request)

    return Depends(_get)


# --- Courses ---
@router.post(
    "/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("curriculum", "create")],
)
async def create_course(
    data: CourseCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a course."""
    service = CurriculumService(db)
    return await service.create_course(
        tenant.tenant_id,
        data.model_dump(),
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.get(
    "/courses",
    response_model=list[CourseResponse],
    dependencies=[_require_tenant(), require_permission("curriculum", "view")],
)
async def list_courses(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    is_published: bool | None = Query(None),
    program_id: UUID | None = Query(None),
):
    """List courses."""
    service = CurriculumService(db)
    return await service.list_courses(
        tenant.tenant_id,
        skip=skip,
        limit=limit,
        is_published=is_published,
        program_id=program_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.get(
    "/courses/{id}",
    response_model=CourseResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "view")],
)
async def get_course(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get course by ID."""
    service = CurriculumService(db)
    return await service.get_course(
        id,
        tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.patch(
    "/courses/{id}",
    response_model=CourseResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "update")],
)
async def update_course(
    id: UUID,
    data: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a course."""
    service = CurriculumService(db)
    return await service.update_course(
        id,
        tenant.tenant_id,
        data.model_dump(exclude_unset=True),
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.delete(
    "/courses/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("curriculum", "delete")],
)
async def delete_course(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a course."""
    service = CurriculumService(db)
    await service.delete_course(
        id,
        tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.post(
    "/courses/bulk-assign-program",
    response_model=CurriculumBulkAssignProgramResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "update")],
)
async def bulk_assign_program(
    data: CurriculumBulkAssignProgramRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Bulk assign/unassign curricula to a program."""
    service = CurriculumService(db)
    updated_count = await service.bulk_assign_program(
        tenant_id=tenant.tenant_id,
        course_ids=data.course_ids,
        program_id=data.program_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )
    return CurriculumBulkAssignProgramResponse(updated_count=updated_count)


# --- Modules (nested under courses) ---
@router.post(
    "/courses/{course_id}/modules",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("curriculum", "create")],
)
async def create_module(
    course_id: UUID,
    data: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a module in a course."""
    service = CurriculumService(db)
    return await service.create_module(
        course_id,
        tenant.tenant_id,
        data.model_dump(),
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.get(
    "/courses/{course_id}/modules",
    response_model=list[ModuleResponse],
    dependencies=[_require_tenant(), require_permission("curriculum", "view")],
)
async def list_modules(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List modules for a course."""
    service = CurriculumService(db)
    return await service.list_modules(
        course_id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.patch(
    "/modules/{id}",
    response_model=ModuleResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "update")],
)
async def update_module(
    id: UUID,
    data: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a module."""
    service = CurriculumService(db)
    return await service.update_module(
        id,
        data.model_dump(exclude_unset=True),
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.delete(
    "/modules/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("curriculum", "delete")],
)
async def delete_module(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a module."""
    service = CurriculumService(db)
    await service.delete_module(
        id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


# --- Lessons (nested under modules) ---
@router.post(
    "/modules/{module_id}/lessons",
    response_model=LessonResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("curriculum", "create")],
)
async def create_lesson(
    module_id: UUID,
    data: LessonCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a lesson in a module."""
    service = CurriculumService(db)
    return await service.create_lesson(
        module_id,
        data.model_dump(),
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.get(
    "/modules/{module_id}/lessons",
    response_model=list[LessonResponse],
    dependencies=[_require_tenant(), require_permission("curriculum", "view")],
)
async def list_lessons(
    module_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List lessons for a module."""
    service = CurriculumService(db)
    return await service.list_lessons(
        module_id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.patch(
    "/lessons/{id}",
    response_model=LessonResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "update")],
)
async def update_lesson(
    id: UUID,
    data: LessonUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a lesson."""
    service = CurriculumService(db)
    return await service.update_lesson(
        id,
        data.model_dump(exclude_unset=True),
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.delete(
    "/lessons/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("curriculum", "delete")],
)
async def delete_lesson(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a lesson."""
    service = CurriculumService(db)
    await service.delete_lesson(
        id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


# --- Labs (nested under lessons) ---
@router.post(
    "/lessons/{lesson_id}/labs",
    response_model=LabResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("curriculum", "create")],
)
async def create_lab(
    lesson_id: UUID,
    data: LabCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a lab in a lesson."""
    service = CurriculumService(db)
    return await service.create_lab(
        lesson_id,
        data.model_dump(),
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.get(
    "/lessons/{lesson_id}/labs",
    response_model=list[LabResponse],
    dependencies=[_require_tenant(), require_permission("curriculum", "view")],
)
async def list_labs(
    lesson_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List labs for a lesson."""
    service = CurriculumService(db)
    return await service.list_labs(
        lesson_id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.patch(
    "/labs/{id}",
    response_model=LabResponse,
    dependencies=[_require_tenant(), require_permission("curriculum", "update")],
)
async def update_lab(
    id: UUID,
    data: LabUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a lab."""
    service = CurriculumService(db)
    return await service.update_lab(
        id,
        data.model_dump(exclude_unset=True),
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )


@router.delete(
    "/labs/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("curriculum", "delete")],
)
async def delete_lab(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a lab."""
    service = CurriculumService(db)
    await service.delete_lab(
        id,
        workspace_tenant_id=tenant.tenant_id,
        parent_tenant_id=tenant.parent_tenant_id,
        governance_mode=tenant.governance_mode,
    )
