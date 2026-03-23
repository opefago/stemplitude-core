"""Labs router -- projects, lab assignments, and submission feedback."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, status
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context

from .schemas import (
    FeedbackCreate,
    FeedbackResponse,
    FeedbackUpdate,
    LabAssignmentCreate,
    LabAssignmentResponse,
    LabAssignmentUpdate,
    ProjectResponse,
)
from .service import LabsService

router = APIRouter()

projects_router = APIRouter(prefix="/projects", tags=["Labs - Projects"])
assignments_router = APIRouter(prefix="/lab-assignments", tags=["Labs - Assignments"])
feedback_router = APIRouter(prefix="/feedback", tags=["Labs - Feedback"])


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""
    return Depends(get_tenant_context)


# ──────────────────────────────────────────────
#  Projects
# ──────────────────────────────────────────────


@projects_router.post(
    "/",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def submit_project(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    title: str = Form(...),
    lab_id: UUID | None = Form(None),
    file: UploadFile = File(...),
):
    """Submit a project (multipart upload to R2)."""
    service = LabsService(db)
    return await service.submit_project(
        identity=identity,
        tenant_ctx=tenant,
        title=title,
        lab_id=lab_id,
        file=file,
    )


@projects_router.get(
    "/",
    response_model=list[ProjectResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_projects(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    student_id: UUID | None = Query(None),
    lab_id: UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """List student projects."""
    service = LabsService(db)
    return await service.list_projects(
        identity=identity,
        tenant_ctx=tenant,
        student_id=student_id,
        lab_id=lab_id,
        skip=skip,
        limit=limit,
    )


@projects_router.get(
    "/{id}",
    response_model=ProjectResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_project(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    expires_in: int = Query(3600, ge=60, le=86400),
):
    """Get project with signed download URL."""
    service = LabsService(db)
    return await service.get_project(
        project_id=id,
        identity=identity,
        tenant_ctx=tenant,
        expires_in=expires_in,
    )


@projects_router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def delete_project(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete a project."""
    service = LabsService(db)
    await service.delete_project(
        project_id=id,
        identity=identity,
        tenant_ctx=tenant,
    )


# ──────────────────────────────────────────────
#  Project Feedback (nested under /projects)
# ──────────────────────────────────────────────


@projects_router.post(
    "/{id}/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "grade")],
)
async def create_feedback(
    id: UUID,
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Leave feedback on a student project submission."""
    service = LabsService(db)
    return await service.create_feedback(
        project_id=id,
        data=data,
        instructor_id=identity.id,
        tenant_id=tenant.tenant_id,
    )


@projects_router.get(
    "/{id}/feedback",
    response_model=list[FeedbackResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_feedback(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List all feedback for a project."""
    service = LabsService(db)
    return await service.list_feedback(project_id=id, tenant_id=tenant.tenant_id)


# ──────────────────────────────────────────────
#  Standalone Feedback (PATCH / DELETE by ID)
# ──────────────────────────────────────────────


@feedback_router.patch(
    "/{id}",
    response_model=FeedbackResponse,
    dependencies=[_require_tenant(), require_permission("labs", "grade")],
)
async def update_feedback(
    id: UUID,
    data: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Edit existing feedback."""
    service = LabsService(db)
    return await service.update_feedback(
        feedback_id=id, data=data, tenant_id=tenant.tenant_id
    )


@feedback_router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("labs", "grade")],
)
async def delete_feedback(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Delete feedback."""
    service = LabsService(db)
    await service.delete_feedback(feedback_id=id, tenant_id=tenant.tenant_id)


# ──────────────────────────────────────────────
#  Lab Assignments
# ──────────────────────────────────────────────


@assignments_router.post(
    "/",
    response_model=LabAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "assign")],
)
async def create_assignment(
    data: LabAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Assign a lab to a student or an entire classroom."""
    service = LabsService(db)
    return await service.create_assignment(
        data=data, assigned_by=identity.id, tenant_id=tenant.tenant_id
    )


@assignments_router.get(
    "/",
    response_model=list[LabAssignmentResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    student_id: UUID | None = Query(None),
    classroom_id: UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """List lab assignments with optional filters."""
    service = LabsService(db)
    return await service.list_assignments(
        tenant_id=tenant.tenant_id,
        student_id=student_id,
        classroom_id=classroom_id,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )


@assignments_router.get(
    "/my",
    response_model=list[LabAssignmentResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_my_assignments(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """List all lab assignments for the current student (direct + classroom)."""
    service = LabsService(db)
    return await service.list_my_assignments(
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
        skip=skip,
        limit=limit,
    )


@assignments_router.get(
    "/{id}",
    response_model=LabAssignmentResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_assignment(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get a single lab assignment."""
    service = LabsService(db)
    return await service.get_assignment(assignment_id=id, tenant_id=tenant.tenant_id)


@assignments_router.patch(
    "/{id}",
    response_model=LabAssignmentResponse,
    dependencies=[_require_tenant(), require_permission("labs", "assign")],
)
async def update_assignment(
    id: UUID,
    data: LabAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a lab assignment (status, due date, notes)."""
    service = LabsService(db)
    return await service.update_assignment(
        assignment_id=id, data=data, tenant_id=tenant.tenant_id
    )


@assignments_router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("labs", "assign")],
)
async def delete_assignment(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Remove a lab assignment."""
    service = LabsService(db)
    await service.delete_assignment(assignment_id=id, tenant_id=tenant.tenant_id)


# Include all sub-routers into the main router
router.include_router(projects_router)
router.include_router(assignments_router)
router.include_router(feedback_router)

from .yjs_router import router as yjs_router  # noqa: E402
router.include_router(yjs_router)
