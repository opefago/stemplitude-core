from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context, require_identity
from app.lesson_content.schemas import (
    LessonCreate,
    LessonResponse,
    LessonUpdate,
    QuizCreate,
    QuizResponse,
    QuizUpdate,
    QuizVersionResponse,
    TrackCreate,
    TrackResponse,
    TrackUpdate,
)
from app.lesson_content.service import LessonTrackService

router = APIRouter()


@router.post(
    "/lessons",
    response_model=LessonResponse,
    dependencies=[require_permission("curriculum", "create")],
)
async def create_lesson(
    payload: LessonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "stemplitude"})
    identity = require_identity(request)
    return await LessonTrackService(db).create_lesson(tenant.tenant_id, data, actor_id=identity.id)


@router.put(
    "/lessons/{lesson_id}",
    response_model=LessonResponse,
    dependencies=[require_permission("curriculum", "update")],
)
async def update_lesson(
    lesson_id: UUID,
    payload: LessonUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).update_lesson(lesson_id, tenant.tenant_id, payload)


@router.get(
    "/quizzes",
    response_model=list[QuizResponse],
    dependencies=[require_permission("curriculum", "view")],
)
async def list_quizzes(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).list_quizzes(tenant.tenant_id, include_stemplitude=True)


@router.post(
    "/quizzes",
    response_model=QuizResponse,
    dependencies=[require_permission("curriculum", "create")],
)
async def create_quiz(
    payload: QuizCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "stemplitude"})
    return await LessonTrackService(db).create_quiz(tenant.tenant_id, data)


@router.put(
    "/quizzes/{quiz_id}",
    response_model=QuizResponse,
    dependencies=[require_permission("curriculum", "update")],
)
async def update_quiz(
    quiz_id: UUID,
    payload: QuizUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).update_quiz(quiz_id, tenant.tenant_id, payload)


@router.get(
    "/quizzes/{quiz_id}/versions",
    response_model=list[QuizVersionResponse],
    dependencies=[require_permission("curriculum", "view")],
)
async def list_quiz_versions(
    quiz_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).list_quiz_versions(quiz_id, tenant.tenant_id)


@router.post(
    "/tracks",
    response_model=TrackResponse,
    dependencies=[require_permission("curriculum", "create")],
)
async def create_track(
    payload: TrackCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "stemplitude"})
    return await LessonTrackService(db).create_track(tenant.tenant_id, data)


@router.put(
    "/tracks/{track_id}",
    response_model=TrackResponse,
    dependencies=[require_permission("curriculum", "update")],
)
async def update_track(
    track_id: UUID,
    payload: TrackUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).update_track(track_id, tenant.tenant_id, payload)


@router.post(
    "/lessons/{lesson_id}/publish",
    response_model=LessonResponse,
    dependencies=[require_permission("curriculum", "publish")],
)
async def publish_lesson(
    lesson_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    payload = LessonUpdate(status="published", visibility="public")
    return await LessonTrackService(db).update_lesson(lesson_id, tenant.tenant_id, payload)


@router.post(
    "/tracks/{track_id}/publish",
    response_model=TrackResponse,
    dependencies=[require_permission("curriculum", "publish")],
)
async def publish_track(
    track_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    payload = TrackUpdate(status="published", visibility="public")
    return await LessonTrackService(db).update_track(track_id, tenant.tenant_id, payload)


@router.post(
    "/lessons/{lesson_id}/archive",
    response_model=LessonResponse,
    dependencies=[require_permission("curriculum", "update")],
)
async def archive_lesson(
    lesson_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    payload = LessonUpdate(status="archived")
    return await LessonTrackService(db).update_lesson(lesson_id, tenant.tenant_id, payload)


@router.post(
    "/tracks/{track_id}/archive",
    response_model=TrackResponse,
    dependencies=[require_permission("curriculum", "update")],
)
async def archive_track(
    track_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    payload = TrackUpdate(status="archived")
    return await LessonTrackService(db).update_track(track_id, tenant.tenant_id, payload)
