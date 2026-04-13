from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context
from app.lesson_content.schemas import SessionCoverageCreate, SuggestedLessonResponse
from app.lesson_content.service import LessonTrackService

router = APIRouter()


@router.get(
    "/{classroom_id}/sessions/{session_id}/suggested-lesson",
    response_model=SuggestedLessonResponse,
    dependencies=[require_permission("classrooms", "view")],
)
async def get_suggested_lesson(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    result = await LessonTrackService(db).get_suggested_lesson(classroom_id, session_id, tenant.tenant_id)
    return SuggestedLessonResponse(**result)


@router.post(
    "/{classroom_id}/sessions/{session_id}/lessons/use-suggested",
    dependencies=[require_permission("classrooms", "update")],
)
async def use_suggested_lesson(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = LessonTrackService(db)
    suggestion = await service.get_suggested_lesson(classroom_id, session_id, tenant.tenant_id)
    payload = SessionCoverageCreate(
        lesson_id=suggestion.get("lesson_id"),
        selection_type="suggested",
        coverage_status="completed",
    )
    actor_id = identity.id if isinstance(identity.id, UUID) else None
    return await service.record_session_coverage(
        tenant_id=tenant.tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
        payload=payload,
        actor_id=actor_id,
    )


@router.post(
    "/{classroom_id}/sessions/{session_id}/lessons/override",
    dependencies=[require_permission("classrooms", "update")],
)
async def override_lesson(
    classroom_id: UUID,
    session_id: UUID,
    payload: SessionCoverageCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    actor_id = identity.id if isinstance(identity.id, UUID) else None
    payload.selection_type = "override"
    return await LessonTrackService(db).record_session_coverage(
        tenant_id=tenant.tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
        payload=payload,
        actor_id=actor_id,
    )


@router.post(
    "/{classroom_id}/sessions/{session_id}/lessons/skip",
    dependencies=[require_permission("classrooms", "update")],
)
async def skip_lesson(
    classroom_id: UUID,
    session_id: UUID,
    payload: SessionCoverageCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    actor_id = identity.id if isinstance(identity.id, UUID) else None
    payload.selection_type = "skip"
    payload.coverage_status = "skipped"
    return await LessonTrackService(db).record_session_coverage(
        tenant_id=tenant.tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
        payload=payload,
        actor_id=actor_id,
    )


@router.post(
    "/{classroom_id}/sessions/{session_id}/resources/add",
    dependencies=[require_permission("classrooms", "update")],
)
async def add_resource(
    classroom_id: UUID,
    session_id: UUID,
    payload: SessionCoverageCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    actor_id = identity.id if isinstance(identity.id, UUID) else None
    payload.selection_type = "added_resource"
    payload.coverage_status = payload.coverage_status or "completed"
    return await LessonTrackService(db).record_session_coverage(
        tenant_id=tenant.tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
        payload=payload,
        actor_id=actor_id,
    )


@router.post(
    "/{classroom_id}/sessions/{session_id}/coverage",
    dependencies=[require_permission("classrooms", "update")],
)
async def record_coverage(
    classroom_id: UUID,
    session_id: UUID,
    payload: SessionCoverageCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    actor_id = identity.id if isinstance(identity.id, UUID) else None
    return await LessonTrackService(db).record_session_coverage(
        tenant_id=tenant.tenant_id,
        classroom_id=classroom_id,
        session_id=session_id,
        payload=payload,
        actor_id=actor_id,
    )
