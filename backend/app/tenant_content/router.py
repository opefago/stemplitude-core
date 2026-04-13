from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context, require_identity
from app.lesson_content.schemas import (
    ClassroomLessonAssignmentCreate,
    CurriculumTrackAssignmentCreate,
    DuplicateContentRequest,
    LessonCreate,
    LessonResponse,
    QuizCreate,
    QuizResponse,
    QuizUpdate,
    QuizVersionResponse,
    TrackAssignmentCreate,
    TrackCreate,
    TrackProgressResponse,
    TrackResponse,
)
from app.lesson_content.service import LessonTrackService

router = APIRouter()


@router.get("/lessons", response_model=list[LessonResponse], dependencies=[require_permission("curriculum", "view")])
async def list_lessons(
    include_stemplitude: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).list_lessons(tenant.tenant_id, include_stemplitude=include_stemplitude)


@router.post("/lessons", response_model=LessonResponse, dependencies=[require_permission("curriculum", "create")])
async def create_lesson(
    payload: LessonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "tenant"})
    identity = require_identity(request)
    return await LessonTrackService(db).create_lesson(tenant.tenant_id, data, actor_id=identity.id)


@router.get("/quizzes", response_model=list[QuizResponse], dependencies=[require_permission("curriculum", "view")])
async def list_quizzes(
    include_stemplitude: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).list_quizzes(tenant.tenant_id, include_stemplitude=include_stemplitude)


@router.post("/quizzes", response_model=QuizResponse, dependencies=[require_permission("curriculum", "create")])
async def create_quiz(
    payload: QuizCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "tenant"})
    return await LessonTrackService(db).create_quiz(tenant.tenant_id, data)


@router.put("/quizzes/{quiz_id}", response_model=QuizResponse, dependencies=[require_permission("curriculum", "update")])
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


@router.get("/tracks", response_model=list[TrackResponse], dependencies=[require_permission("curriculum", "view")])
async def list_tracks(
    include_stemplitude: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).list_tracks(tenant.tenant_id, include_stemplitude=include_stemplitude)


@router.post("/tracks", response_model=TrackResponse, dependencies=[require_permission("curriculum", "create")])
async def create_track(
    payload: TrackCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    data = payload.model_copy(update={"owner_type": "tenant"})
    return await LessonTrackService(db).create_track(tenant.tenant_id, data)


@router.post("/content/duplicate", dependencies=[require_permission("curriculum", "create")])
async def duplicate_content(
    payload: DuplicateContentRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).duplicate_content(tenant.tenant_id, payload)


@router.post(
    "/classrooms/{classroom_id}/track-assignments",
    dependencies=[require_permission("classrooms", "update")],
)
async def assign_track_to_classroom(
    classroom_id: UUID,
    payload: TrackAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).assign_track_to_classroom(tenant.tenant_id, classroom_id, payload)


@router.post(
    "/curriculums/{curriculum_id}/track-assignments",
    dependencies=[require_permission("curriculum", "update")],
)
async def assign_track_to_curriculum(
    curriculum_id: UUID,
    payload: CurriculumTrackAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).assign_track_to_curriculum(tenant.tenant_id, curriculum_id, payload)


@router.post(
    "/classrooms/{classroom_id}/lesson-assignments",
    dependencies=[require_permission("classrooms", "update")],
)
async def assign_lesson_to_classroom(
    classroom_id: UUID,
    payload: ClassroomLessonAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).assign_lesson_to_classroom(tenant.tenant_id, classroom_id, payload)


@router.get(
    "/progress/overview",
    response_model=TrackProgressResponse,
    dependencies=[require_permission("progress", "view")],
)
async def get_track_progress(
    student_id: UUID,
    track_instance_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).compute_track_progress(tenant.tenant_id, student_id, track_instance_id)
