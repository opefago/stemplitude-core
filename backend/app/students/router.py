import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context
from app.students.schemas import (
    ParentLinkRequest,
    ParentResponse,
    ResetPasswordRequest,
    StudentCreate,
    StudentLinkRequest,
    StudentMembershipCreate,
    StudentMembershipResponse,
    StudentProfile,
    StudentSelfRegister,
    StudentUpdate,
    UsernameCheckResponse,
)
from app.students.service import StudentService
from app.database import async_session_factory
from app.classrooms.schemas import (
    ClassroomResponse,
    RealtimeEventEnvelope,
    RealtimeSessionSnapshotResponse,
    SessionChatCreateRequest,
    SessionEventResponse,
    SessionPresenceHeartbeatRequest,
    SessionPresenceParticipantResponse,
    SessionPresenceSummaryResponse,
    SessionResponse,
    SubmissionRecord,
)
from app.classrooms.service import ClassroomService
from app.assets.schemas import AssetResponse
from app.assets.repository import AssetRepository
from app.assets.service import AssetsService
from app.core import blob_storage
from app.classrooms.models import ClassroomSession
from app.classrooms.realtime import emit_presence_updated_for_session

router = APIRouter()


class StudentSessionSubmissionRequest(BaseModel):
    assignment_id: str | None = Field(
        default=None, description="Optional assignment id tied to this submission."
    )
    content: str = Field(..., min_length=1, max_length=20000)
    status: Literal["draft", "submitted"] = "draft"


class StudentAssignmentResponse(BaseModel):
    id: str
    title: str
    description: str = ""
    instructions: str | None = None
    due_at: str | None = None
    lab_id: str | None = None
    classroom_id: str
    classroom_name: str
    session_id: str
    session_start: str
    session_end: str
    session_status: str
    submission_status: str | None = None  # "draft" | "submitted" | None


async def _ensure_student_session_access(
    *,
    db: AsyncSession,
    classroom_id: UUID,
    session_id: UUID,
    identity: CurrentIdentity,
    tenant_id: UUID,
) -> ClassroomSession:
    service = StudentService(db)
    return await service.ensure_student_session_access(
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=identity.id,
        tenant_id=tenant_id,
    )


async def _resolve_tenant_from_identifier(identifier: str):
    """Resolve tenant by UUID, slug, or code."""
    async with async_session_factory() as session:
        service = StudentService(session)
        return await service.resolve_tenant_from_identifier(identifier)


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""

    async def _get(request: Request) -> TenantContext:
        return get_tenant_context(request)

    return Depends(_get)


@router.post(
    "/",
    response_model=StudentProfile,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("students", "create")],
)
async def create_student(
    data: StudentCreate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(status_code=403, detail="Only users can create students")
    service = StudentService(db)
    student = await service.create_student(
        data, tenant.tenant_id, identity.id if identity.sub_type == "user" else None
    )
    return StudentProfile(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.email,
        display_name=student.display_name,
        date_of_birth=student.date_of_birth,
        avatar_url=student.avatar_url,
        global_account=student.global_account,
        is_active=student.is_active,
    )


@router.post(
    "/self-register",
    response_model=StudentProfile,
    status_code=status.HTTP_201_CREATED,
)
async def self_register(
    data: StudentSelfRegister,
    db: AsyncSession = Depends(get_db),
):
    identifier = data.tenant_slug or data.tenant_code
    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="tenant_slug or tenant_code required for self-registration",
        )
    tenant = await _resolve_tenant_from_identifier(identifier)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    service = StudentService(db)
    student = await service.self_register(data, tenant)
    return StudentProfile(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.email,
        display_name=student.display_name,
        date_of_birth=student.date_of_birth,
        avatar_url=student.avatar_url,
        global_account=student.global_account,
        is_active=student.is_active,
    )


@router.get(
    "/check-username",
    response_model=UsernameCheckResponse,
    dependencies=[_require_tenant()],
)
async def check_username(
    username: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    available = await service.check_username(username, tenant.tenant_id)
    return UsernameCheckResponse(available=available, username=username)


@router.get(
    "/",
    response_model=list[StudentProfile],
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def list_students(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    is_active: bool | None = Query(None),
):
    service = StudentService(db)
    students = await service.repo.list_by_tenant(
        tenant.tenant_id, skip=skip, limit=limit, is_active=is_active
    )
    return [
        StudentProfile(
            id=s.id,
            first_name=s.first_name,
            last_name=s.last_name,
            email=s.email,
            display_name=s.display_name,
            date_of_birth=s.date_of_birth,
            avatar_url=s.avatar_url,
            global_account=s.global_account,
            is_active=s.is_active,
        )
        for s in students
    ]


@router.get(
    "/{id}",
    response_model=StudentProfile,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def get_student(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    student = await service.get_student(id, tenant.tenant_id)
    return StudentProfile(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.email,
        display_name=student.display_name,
        date_of_birth=student.date_of_birth,
        avatar_url=student.avatar_url,
        global_account=student.global_account,
        is_active=student.is_active,
    )


@router.patch(
    "/{id}",
    response_model=StudentProfile,
    dependencies=[_require_tenant(), require_permission("students", "update")],
)
async def update_student(
    id: UUID,
    data: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    student = await service.update_student(id, tenant.tenant_id, data, identity)
    return StudentProfile(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.email,
        display_name=student.display_name,
        date_of_birth=student.date_of_birth,
        avatar_url=student.avatar_url,
        global_account=student.global_account,
        is_active=student.is_active,
    )


@router.post(
    "/{id}/enroll",
    response_model=StudentMembershipResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("students", "enroll")],
)
async def enroll_student(
    id: UUID,
    data: StudentMembershipCreate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(status_code=403, detail="Only users can enroll students")
    service = StudentService(db)
    membership = await service.enroll_student(
        id, data.tenant_id, data, identity.id
    )
    return StudentMembershipResponse(
        id=membership.id,
        student_id=membership.student_id,
        tenant_id=membership.tenant_id,
        username=membership.username,
        grade_level=membership.grade_level,
        role=membership.role,
        is_active=membership.is_active,
    )


@router.get(
    "/{id}/memberships",
    response_model=list[StudentMembershipResponse],
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def list_memberships(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    await service.get_student(id, tenant.tenant_id)
    memberships = await service.repo.list_memberships(id)
    return [
        StudentMembershipResponse(
            id=m.id,
            student_id=m.student_id,
            tenant_id=m.tenant_id,
            username=m.username,
            grade_level=m.grade_level,
            role=m.role,
            is_active=m.is_active,
        )
        for m in memberships
    ]


@router.post(
    "/{id}/link",
    response_model=StudentProfile,
    dependencies=[_require_tenant(), require_permission("students", "link")],
)
async def link_students(
    id: UUID,
    data: StudentLinkRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    target_id = data.target_student_id
    service = StudentService(db)
    student = await service.link_students(id, target_id, tenant.tenant_id)
    return StudentProfile(
        id=student.id,
        first_name=student.first_name,
        last_name=student.last_name,
        email=student.email,
        display_name=student.display_name,
        date_of_birth=student.date_of_birth,
        avatar_url=student.avatar_url,
        global_account=student.global_account,
        is_active=student.is_active,
    )


@router.post(
    "/{id}/parents",
    response_model=ParentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("students", "manage_parents")],
)
async def link_parent(
    id: UUID,
    data: ParentLinkRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    link = await service.link_parent(id, data, tenant.tenant_id)
    return ParentResponse(
        id=link.id,
        user_id=link.user_id,
        student_id=link.student_id,
        relationship=link.relationship,
        is_primary_contact=link.is_primary_contact,
    )


@router.get(
    "/{id}/parents",
    response_model=list[ParentResponse],
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def list_parents(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    await service.get_student(id, tenant.tenant_id)
    parents = await service.repo.list_parents(id)
    return [
        ParentResponse(
            id=p.id,
            user_id=p.user_id,
            student_id=p.student_id,
            relationship=p.relationship,
            is_primary_contact=p.is_primary_contact,
        )
        for p in parents
    ]


@router.post(
    "/{id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("students", "update")],
)
async def reset_password(
    id: UUID,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    service = StudentService(db)
    await service.reset_password(id, tenant.tenant_id, data)


@router.get(
    "/me/upcoming-sessions",
    response_model=list,
    dependencies=[_require_tenant()],
)
async def my_upcoming_sessions(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(20, ge=1, le=100),
):
    """Upcoming sessions for the current student (across all enrolled classrooms)."""
    from app.classrooms.schemas import SessionResponse

    service = StudentService(db)
    sessions = await service.list_my_upcoming_sessions(
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get(
    "/me/active-sessions",
    response_model=list,
    dependencies=[_require_tenant()],
)
async def my_active_sessions(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(20, ge=1, le=100),
):
    """Active sessions for the current student (across enrolled classrooms)."""
    from app.classrooms.schemas import SessionResponse

    service = StudentService(db)
    sessions = await service.list_my_active_sessions(
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get(
    "/me/assignments",
    response_model=list[StudentAssignmentResponse],
    dependencies=[_require_tenant()],
)
async def my_assignments(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(200, ge=1, le=500),
):
    service = StudentService(db)
    items = await service.list_my_assignments(
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [StudentAssignmentResponse.model_validate(item) for item in items]


@router.get(
    "/me/classrooms",
    response_model=list,
    dependencies=[_require_tenant()],
)
async def my_classrooms(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Classrooms the current student is enrolled in."""
    from app.classrooms.schemas import ClassroomResponse

    service = StudentService(db)
    classrooms = await service.list_my_classrooms(
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
    )
    return [ClassroomResponse.model_validate(c) for c in classrooms]


@router.get(
    "/me/classrooms/{classroom_id}",
    response_model=ClassroomResponse,
    dependencies=[_require_tenant()],
)
async def my_classroom_by_id(
    classroom_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Single classroom for current student, only if enrolled."""
    service = StudentService(db)
    classroom = await service.get_my_classroom(
        classroom_id=classroom_id,
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
    )
    return ClassroomResponse.model_validate(classroom)


@router.get(
    "/me/classrooms/{classroom_id}/sessions",
    response_model=list[SessionResponse],
    dependencies=[_require_tenant()],
)
async def my_classroom_sessions(
    classroom_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(100, ge=1, le=500),
):
    """Sessions for a classroom where current student is enrolled."""
    service = StudentService(db)
    sessions = await service.list_my_classroom_sessions(
        classroom_id=classroom_id,
        student_id=identity.id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.post(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/submissions",
    response_model=dict,
    dependencies=[_require_tenant()],
)
async def create_my_session_submission(
    classroom_id: UUID,
    session_id: UUID,
    data: StudentSessionSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Save/submit student work tied to a specific classroom session."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )

    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Submission content is required")

    service = ClassroomService(db)
    if data.assignment_id:
        can_edit = await service.can_student_edit_submission(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant.tenant_id,
            student_id=identity.id,
            assignment_id=data.assignment_id,
        )
        if not can_edit:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Submitted work for this assignment is locked. "
                    "You can only continue editing while it is in draft."
                ),
            )
    event_type = (
        "student.submission.submitted"
        if data.status == "submitted"
        else "student.submission.saved"
    )
    envelope = await service.publish_generic_session_event(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        event_type=event_type,
        payload={
            "assignment_id": data.assignment_id,
            "content": content,
            "status": data.status,
            "student_id": str(identity.id),
        },
    )
    if data.status == "submitted":
        await service.notify_instructor_submission(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant.tenant_id,
            student_id=identity.id,
            assignment_id=data.assignment_id,
        )
    return envelope.model_dump(mode="json")


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/submissions",
    response_model=list[SubmissionRecord],
    dependencies=[_require_tenant()],
)
async def list_my_session_submissions(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    assignment_id: str | None = Query(None, description="Optional assignment id filter."),
):
    """List current student's own submissions (drafts/submitted) for a session."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    items = await service.list_session_submissions(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        assignment_id=assignment_id,
        student_id=identity.id,
    )
    return [SubmissionRecord.model_validate(i) for i in items]


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/snapshot",
    response_model=RealtimeSessionSnapshotResponse,
    dependencies=[_require_tenant()],
)
async def my_session_realtime_snapshot(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    after_sequence: int = Query(0, ge=0),
    replay_limit: int = Query(300, ge=1, le=1000),
):
    """Student-safe realtime snapshot fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.get_realtime_snapshot(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        after_sequence=after_sequence,
        replay_limit=replay_limit,
    )


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/events",
    response_model=list[RealtimeEventEnvelope],
    dependencies=[_require_tenant()],
)
async def my_session_realtime_events(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    after_sequence: int = Query(0, ge=0),
    limit: int = Query(300, ge=1, le=1000),
):
    """Student-safe realtime replay fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.replay_session_events(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        after_sequence=after_sequence,
        limit=limit,
    )


@router.post(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/presence",
    response_model=SessionPresenceSummaryResponse,
    dependencies=[_require_tenant()],
)
async def my_session_presence_heartbeat(
    classroom_id: UUID,
    session_id: UUID,
    data: SessionPresenceHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe presence heartbeat fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    result = await service.heartbeat_session_presence(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )
    if data.status in {"in_lab", "left"}:
        await emit_presence_updated_for_session(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant.tenant_id,
        )
    return result


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/presence",
    response_model=SessionPresenceSummaryResponse,
    dependencies=[_require_tenant()],
)
async def my_session_presence_summary(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe presence summary fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.get_session_presence_summary(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/presence/participants",
    response_model=list[SessionPresenceParticipantResponse],
    dependencies=[_require_tenant()],
)
async def my_session_presence_participants(
    classroom_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe participants roster fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.get_session_presence_participants(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )


@router.post(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/chat",
    response_model=SessionEventResponse,
    dependencies=[_require_tenant()],
)
async def my_session_chat_send(
    classroom_id: UUID,
    session_id: UUID,
    data: SessionChatCreateRequest,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe chat fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.create_session_chat_event(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )


@router.get(
    "/me/classrooms/{classroom_id}/sessions/{session_id}/assets/{asset_id}",
    response_model=AssetResponse,
    dependencies=[_require_tenant()],
)
async def my_session_asset_by_id(
    classroom_id: UUID,
    session_id: UUID,
    asset_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    expires_in: int = Query(3600, ge=60, le=86400),
):
    """Student-safe signed URL for assets attached to this classroom session."""
    session_obj = await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        identity=identity,
        tenant_id=tenant.tenant_id,
    )

    shared_ids: set[str] = set()
    downloadable_ids: set[str] = set()
    try:
        raw_notes = json.loads(session_obj.notes or "")
        if isinstance(raw_notes, dict) and raw_notes.get("__kind") == "session_notes_v1":
            content = raw_notes.get("content") or {}
            if isinstance(content, dict):
                shared_ids = {str(x) for x in content.get("shared_asset_ids") or [] if x}
                downloadable_ids = {str(x) for x in content.get("downloadable_asset_ids") or [] if x}
    except Exception:
        pass

    allowed_asset_ids = shared_ids | downloadable_ids
    if str(asset_id) not in allowed_asset_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id, tenant.tenant_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    signed_url = blob_storage.generate_presigned_url(asset.blob_key, expires_in)
    resp = AssetsService(db)._to_response(asset)
    return resp.model_copy(update={"blob_url": signed_url})


@router.get(
    "/parent/children-sessions",
    response_model=list,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def parent_children_sessions(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(50, ge=1, le=200),
):
    """Upcoming sessions across all children linked to the current parent."""
    from app.classrooms.schemas import SessionResponse

    service = StudentService(db)
    sessions = await service.list_parent_children_upcoming_sessions(
        parent_user_id=identity.id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [SessionResponse.model_validate(s) for s in sessions]
