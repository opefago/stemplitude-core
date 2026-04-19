"""Robotics API router for projects, attempts, and telemetry contracts."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context
from app.robotics.schemas import (
    RoboticsAttemptCreate,
    RoboticsAttemptResponse,
    RoboticsCapabilityManifest,
    RoboticsCompileJobResponse,
    RoboticsCompileRequest,
    RoboticsEventsIngestRequest,
    RoboticsEventsIngestResponse,
    RoboticsProjectCreate,
    RoboticsProjectResponse,
    RoboticsProjectUpdate,
    RoboticsTemplateResolveResponse,
    RoboticsWorldCreate,
    RoboticsWorldResponse,
    RoboticsWorldUpdate,
    RoboticsWorldGalleryItem,
    RoboticsLeaderboardEntry,
)
from app.robotics.service import RoboticsService

router = APIRouter()


def _require_tenant():
    return Depends(get_tenant_context)


@router.get(
    "/templates/resolve",
    response_model=RoboticsTemplateResolveResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def resolve_template(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    curriculum_lab_id: UUID | None = Query(None),
    lesson_id: UUID | None = Query(None),
    assignment_id: UUID | None = Query(None),
):
    service = RoboticsService(db)
    return await service.resolve_template(
        tenant=tenant,
        curriculum_lab_id=curriculum_lab_id,
        lesson_id=lesson_id,
        assignment_id=assignment_id,
    )


@router.get(
    "/manifests",
    response_model=list[RoboticsCapabilityManifest],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_capability_manifests(
    db: AsyncSession = Depends(get_db),
):
    service = RoboticsService(db)
    return service.list_manifests()


@router.post(
    "/compile/jobs",
    response_model=RoboticsCompileJobResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def create_compile_job(
    data: RoboticsCompileRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = RoboticsService(db)
    return await service.create_compile_job(data=data, tenant=tenant, identity=identity)


@router.get(
    "/compile/jobs/{job_id}",
    response_model=RoboticsCompileJobResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_compile_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    job = service.get_compile_job(job_id=job_id, tenant=tenant)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robotics compile job not found")
    return job


@router.post(
    "/projects",
    response_model=RoboticsProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def create_project(
    data: RoboticsProjectCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = RoboticsService(db)
    return service.create_project(data=data, tenant=tenant, identity=identity)


@router.get(
    "/projects",
    response_model=list[RoboticsProjectResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_projects(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    student_id: UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    service = RoboticsService(db)
    return service.list_projects(tenant=tenant, student_id=student_id, skip=skip, limit=limit)


@router.get(
    "/projects/{project_id}",
    response_model=RoboticsProjectResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    project = service.get_project(project_id=project_id, tenant=tenant)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robotics project not found")
    return project


@router.patch(
    "/projects/{project_id}",
    response_model=RoboticsProjectResponse,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def update_project(
    project_id: UUID,
    data: RoboticsProjectUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    project = service.update_project(project_id=project_id, data=data, tenant=tenant)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robotics project not found")
    return project


@router.post(
    "/projects/{project_id}/attempts",
    response_model=RoboticsAttemptResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def create_attempt(
    project_id: UUID,
    data: RoboticsAttemptCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    attempt = service.create_attempt(project_id=project_id, data=data, tenant=tenant)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robotics project not found")
    return attempt


@router.get(
    "/projects/{project_id}/attempts",
    response_model=list[RoboticsAttemptResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_attempts(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    return service.list_attempts(project_id=project_id, tenant=tenant)


@router.post(
    "/events/ingest",
    response_model=RoboticsEventsIngestResponse,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def ingest_events(
    data: RoboticsEventsIngestRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    accepted = service.ingest_events(tenant=tenant, events=data.events)
    return RoboticsEventsIngestResponse(accepted_count=accepted)


# --- World endpoints ---

@router.post(
    "/worlds",
    response_model=RoboticsWorldResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def create_world(
    data: RoboticsWorldCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = RoboticsService(db)
    return service.create_world(data=data, tenant=tenant, identity=identity)


@router.get(
    "/worlds",
    response_model=list[RoboticsWorldResponse],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_worlds(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    service = RoboticsService(db)
    return service.list_worlds(tenant=tenant, creator_id=identity.id, skip=skip, limit=limit)


@router.get(
    "/worlds/gallery",
    response_model=list[RoboticsWorldGalleryItem],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def list_world_gallery(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    difficulty: str | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    service = RoboticsService(db)
    return service.list_world_gallery(
        tenant=tenant, difficulty=difficulty, search=search, skip=skip, limit=limit,
    )


@router.get(
    "/worlds/code/{share_code}",
    response_model=RoboticsWorldResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_world_by_share_code(
    share_code: str,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    world = service.get_world_by_share_code(share_code=share_code)
    if world is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="World not found")
    return world


@router.get(
    "/worlds/{world_id}",
    response_model=RoboticsWorldResponse,
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_world(
    world_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    world = service.get_world(world_id=world_id, tenant=tenant)
    if world is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="World not found")
    return world


@router.patch(
    "/worlds/{world_id}",
    response_model=RoboticsWorldResponse,
    dependencies=[_require_tenant(), require_permission("labs", "create")],
)
async def update_world(
    world_id: UUID,
    data: RoboticsWorldUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = RoboticsService(db)
    world = service.update_world(world_id=world_id, data=data, tenant=tenant)
    if world is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="World not found")
    return world


@router.get(
    "/worlds/{world_id}/leaderboard",
    response_model=list[RoboticsLeaderboardEntry],
    dependencies=[_require_tenant(), require_permission("labs", "view")],
)
async def get_world_leaderboard(
    world_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(20, ge=1, le=100),
):
    service = RoboticsService(db)
    return service.get_world_leaderboard(world_id=world_id, tenant=tenant, limit=limit)

