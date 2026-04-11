import json
from datetime import datetime, timezone
import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context
from app.students.me_student import require_me_student_id
from app.students.parent_access import ensure_can_view_student_as_guardian
from app.students.parent_activity import (
    load_parent_child_activity,
    load_parent_child_assignment_grades,
)
from app.students.schemas import (
    AttendanceExcusalCreate,
    AttendanceExcusalReview,
    AttendanceExcusalRow,
    AttendanceExcusalStaffRow,
    GuardianAttendanceOverviewResponse,
    GuardianChildControlsPatch,
    GuardianChildControlsResponse,
    ParentActivityKind,
    ParentChildActivityResponse,
    ParentChildAssignmentGradesResponse,
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
from app.students.attendance_excusal_service import AttendanceExcusalService
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
logger = logging.getLogger(__name__)


def _utc_activity_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class StudentSessionSubmissionRequest(BaseModel):
    assignment_id: str | None = Field(
        default=None, description="Optional assignment id tied to this submission."
    )
    content: str = Field(..., min_length=1, max_length=20000)
    status: Literal["draft", "submitted"] = "draft"
    preview_image: str | None = Field(
        default=None,
        max_length=480_000,
        description="Optional data URL (image/png or image/jpeg) snapshot of lab work.",
    )
    lab_id: str | None = Field(
        default=None,
        max_length=120,
        description="Optional lab identifier (e.g. design-maker) for filtering in the UI.",
    )


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
    student_id: UUID,
    tenant_id: UUID,
) -> ClassroomSession:
    service = StudentService(db)
    return await service.ensure_student_session_access(
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=student_id,
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
    "/{id:uuid}",
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
    "/{id:uuid}",
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
    "/{id:uuid}/enroll",
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
    "/{id:uuid}/memberships",
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
    "/{id:uuid}/link",
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
    "/{id:uuid}/parents",
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
    "/{id:uuid}/parents",
    response_model=list[ParentResponse],
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def list_parents(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    from app.users.models import User

    service = StudentService(db)
    await service.get_student(id, tenant.tenant_id)
    parents = await service.repo.list_parents(id)
    out: list[ParentResponse] = []
    for p in parents:
        u = await db.get(User, p.user_id)
        em = (u.email or "").strip() if u else ""
        out.append(
            ParentResponse(
                id=p.id,
                user_id=p.user_id,
                student_id=p.student_id,
                relationship=p.relationship,
                is_primary_contact=p.is_primary_contact,
                user_email=em or None,
            )
        )
    return out


@router.post(
    "/{id:uuid}/reset-password",
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(20, ge=1, le=100),
):
    """Upcoming sessions for the current student (across all enrolled classrooms)."""
    from app.classrooms.schemas import SessionResponse

    service = StudentService(db)
    sessions = await service.list_my_upcoming_sessions(
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(20, ge=1, le=100),
):
    """Active sessions for the current student (across enrolled classrooms)."""
    from app.classrooms.schemas import SessionResponse

    service = StudentService(db)
    sessions = await service.list_my_active_sessions(
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(200, ge=1, le=500),
):
    service = StudentService(db)
    items = await service.list_my_assignments(
        student_id=me_student_id,
        tenant_id=tenant.tenant_id,
        limit=limit,
    )
    return [StudentAssignmentResponse.model_validate(item) for item in items]


@router.get(
    "/parent/children/{student_id}/assignments",
    response_model=list[StudentAssignmentResponse],
    dependencies=[_require_tenant()],
)
async def parent_child_assignments(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(200, ge=1, le=500),
):
    if identity.sub_type != "user":
        raise HTTPException(status_code=403, detail="User session required")
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    service = StudentService(db)
    items = await service.list_my_assignments(
        student_id=student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Classrooms the current student is enrolled in."""
    from app.classrooms.schemas import ClassroomResponse

    service = StudentService(db)
    classrooms = await service.list_my_classrooms(
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Single classroom for current student, only if enrolled."""
    service = StudentService(db)
    classroom = await service.get_my_classroom(
        classroom_id=classroom_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(100, ge=1, le=500),
):
    """Sessions for a classroom where current student is enrolled."""
    service = StudentService(db)
    sessions = await service.list_my_classroom_sessions(
        classroom_id=classroom_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Save/submit student work tied to a specific classroom session."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
        tenant_id=tenant.tenant_id,
    )

    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Submission content is required")

    preview_image: str | None = None
    if data.preview_image:
        raw = data.preview_image.strip()
        if not raw.startswith("data:image/") or ";base64," not in raw:
            raise HTTPException(
                status_code=400,
                detail="preview_image must be a base64 data URL (image/png or image/jpeg).",
            )
        preview_image = raw

    service = ClassroomService(db)
    if data.assignment_id:
        can_edit = await service.can_student_edit_submission(
            classroom_id=classroom_id,
            session_id=session_id,
            tenant_id=tenant.tenant_id,
            student_id=me_student_id,
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
    submission_payload: dict = {
        "assignment_id": data.assignment_id,
        "content": content,
        "status": data.status,
        "student_id": str(identity.id),
    }
    if preview_image:
        submission_payload["preview_image"] = preview_image
    if data.lab_id and data.lab_id.strip():
        submission_payload["lab_id"] = data.lab_id.strip()

    envelope = await service.publish_generic_session_event(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        event_type=event_type,
        payload=submission_payload,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    assignment_id: str | None = Query(None, description="Optional assignment id filter."),
):
    """List current student's own submissions (drafts/submitted) for a session."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    items = await service.list_session_submissions(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        assignment_id=assignment_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    after_sequence: int = Query(0, ge=0),
    replay_limit: int = Query(300, ge=1, le=1000),
):
    """Student-safe realtime snapshot fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    after_sequence: int = Query(0, ge=0),
    limit: int = Query(300, ge=1, le=1000),
):
    """Student-safe realtime replay fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe presence heartbeat fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    result = await service.heartbeat_session_presence(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
        student_actor_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe presence summary fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Student-safe chat fallback endpoint."""
    await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
        tenant_id=tenant.tenant_id,
    )
    service = ClassroomService(db)
    return await service.create_session_chat_event(
        classroom_id=classroom_id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
        student_actor_id=me_student_id,
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
    me_student_id: UUID = Depends(require_me_student_id),
    tenant: TenantContext = Depends(get_tenant_context),
    expires_in: int = Query(3600, ge=60, le=86400),
):
    """Student-safe signed URL for assets attached to this classroom session."""
    session_obj = await _ensure_student_session_access(
        db=db,
        classroom_id=classroom_id,
        session_id=session_id,
        student_id=me_student_id,
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
    "/parent/children",
    response_model=list[StudentProfile],
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def parent_children(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Learners the current user may manage: linked children for parents, all active students for staff.

    Staff (owner/admin/instructor) see active students in the tenant — same scope as paying membership
    or acting on behalf of a learner (see ``ensure_can_view_student_as_guardian``).
    """
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can list children",
        )
    role = (identity.role or "").strip().lower()
    service = StudentService(db)
    if role in ("parent", "homeschool_parent"):
        students = await service.list_guardian_children(
            guardian_user_id=identity.id,
            tenant_id=tenant.tenant_id,
            role_slug=role,
        )
    elif role in ("owner", "admin", "instructor"):
        students = await service.repo.list_by_tenant(
            tenant.tenant_id, skip=0, limit=200, is_active=True
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent, homeschool parent, or staff (owner / admin / instructor) role required",
        )
    grade_map = await service.repo.grade_levels_for_students_in_tenant(
        [s.id for s in students], tenant.tenant_id
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
            grade_level=grade_map.get(s.id),
        )
        for s in students
    ]


@router.get(
    "/parent/children/{student_id}/controls",
    response_model=GuardianChildControlsResponse,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def get_guardian_child_controls(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can view guardian controls",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    service = StudentService(db)
    return await service.get_guardian_child_controls(
        student_id, tenant.tenant_id, identity
    )


@router.patch(
    "/parent/children/{student_id}/controls",
    response_model=GuardianChildControlsResponse,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def patch_guardian_child_controls(
    student_id: UUID,
    data: GuardianChildControlsPatch,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can update guardian controls",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    service = StudentService(db)
    return await service.patch_guardian_child_controls(
        student_id, tenant.tenant_id, identity, data
    )


@router.delete(
    "/parent/children/{student_id}/link",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def unlink_guardian_from_child(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can remove a guardian link",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    service = StudentService(db)
    await service.unlink_guardian_from_student(student_id, tenant.tenant_id, identity)


@router.get(
    "/parent/children/{student_id}/activity",
    response_model=ParentChildActivityResponse,
    dependencies=[_require_tenant(), require_permission("progress", "view")],
)
async def parent_child_activity(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=100),
    occurred_after: datetime | None = Query(
        None, description="Inclusive lower bound (ISO 8601). Defaults to 90 days before occurred_before."
    ),
    occurred_before: datetime | None = Query(
        None, description="Inclusive upper bound (ISO 8601). Defaults to now (UTC)."
    ),
    activity_kind: ParentActivityKind | None = Query(
        None, description="When set, only this activity type is included."
    ),
    without_classroom: bool = Query(
        False,
        description="When true, only activity not tied to a class (lessons, labs, badges, XP).",
    ),
    classroom_id: UUID | None = Query(
        None,
        description="When set, only assignment and attendance rows for this classroom.",
    ),
):
    """Paginated learning events in a bounded date range and a rolling weekly digest for one child."""
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can view child activity",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    if without_classroom and classroom_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use either without_classroom or classroom_id, not both",
        )
    try:
        return await load_parent_child_activity(
            db,
            student_id=student_id,
            tenant_id=tenant.tenant_id,
            skip=skip,
            limit=limit,
            occurred_after=_utc_activity_datetime(occurred_after),
            occurred_before=_utc_activity_datetime(occurred_before),
            activity_kind=activity_kind,
            without_classroom=without_classroom,
            classroom_id=classroom_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/parent/children/{student_id}/assignment-grades",
    response_model=ParentChildAssignmentGradesResponse,
    dependencies=[_require_tenant(), require_permission("progress", "view")],
)
async def parent_child_assignment_grades(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    graded_after: datetime | None = Query(
        None,
        description="Inclusive lower bound on grade time (ISO 8601). Defaults to one year before graded_before.",
    ),
    graded_before: datetime | None = Query(
        None,
        description="Inclusive upper bound on grade time (ISO 8601). Defaults to now (UTC).",
    ),
    classroom_id: UUID | None = Query(
        None,
        description="When set, only grades from this classroom.",
    ),
):
    """Assignment scores and rubric breakdown for a linked learner (guardian dashboard)."""
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can view child grades",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    try:
        return await load_parent_child_assignment_grades(
            db,
            student_id=student_id,
            tenant_id=tenant.tenant_id,
            skip=skip,
            limit=limit,
            graded_after=_utc_activity_datetime(graded_after),
            graded_before=_utc_activity_datetime(graded_before),
            classroom_id=classroom_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception:
        logger.exception(
            "Failed loading guardian assignment grades",
            extra={
                "student_id": str(student_id),
                "tenant_id": str(tenant.tenant_id),
                "skip": skip,
                "limit": limit,
            },
        )
        return ParentChildAssignmentGradesResponse(
            grades=[],
            total=0,
            skip=skip,
            limit=limit,
        )


@router.get(
    "/parent/children-sessions",
    response_model=list,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def parent_children_sessions(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(50, ge=1, le=800),
    student_id: UUID | None = Query(
        None, description="When set, only sessions for this learner (must be your child)."
    ),
    time_scope: Annotated[
        Literal["upcoming", "past"],
        Query(description="upcoming = future sessions; past = ended sessions"),
    ] = "upcoming",
    session_start_before: datetime | None = Query(
        None,
        description=(
            "Upcoming only: exclude sessions with start >= this instant (UTC). "
            "Use local start-of-next-month as ISO8601 to scope to the current calendar month."
        ),
    ),
    expand_month_sessions: bool = Query(
        False,
        description=(
            "Upcoming only, with session_start_before: return a large merged month view "
            "for the parent Events hub. The response may include up to ~1400 occurrences "
            "for the month (not capped to `limit`), so “later this month” is populated even "
            "when many sessions fall in the next 7 days."
        ),
    ),
):
    """Upcoming or past sessions for linked children (or all tenant students for homeschool)."""
    from app.classrooms.schemas import SessionResponse

    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can list children sessions",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )

    if student_id is not None:
        await ensure_can_view_student_as_guardian(
            db,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant.tenant_id,
        )

    service = StudentService(db)
    if time_scope == "past":
        sessions = await service.list_parent_children_past_sessions(
            parent_user_id=identity.id,
            tenant_id=tenant.tenant_id,
            limit=limit,
            guardian_role_slug=role,
            student_id=student_id,
        )
    else:
        sessions = await service.list_parent_children_upcoming_sessions(
            parent_user_id=identity.id,
            tenant_id=tenant.tenant_id,
            limit=limit,
            guardian_role_slug=role,
            student_id=student_id,
            session_start_before=_utc_activity_datetime(session_start_before),
            expand_month_sessions=expand_month_sessions,
        )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.get(
    "/parent/linked-classrooms",
    response_model=list,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def parent_linked_classrooms(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Classrooms any of the guardian's linked learners are enrolled in (tenant students for homeschool)."""
    from app.classrooms.schemas import ClassroomResponse

    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can list linked classrooms",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    service = StudentService(db)
    classrooms = await service.list_guardian_linked_classrooms(
        guardian_user_id=identity.id,
        tenant_id=tenant.tenant_id,
        role_slug=role,
    )
    return [ClassroomResponse.model_validate(c) for c in classrooms]


@router.get(
    "/parent/children/{student_id}/attendance-overview",
    response_model=GuardianAttendanceOverviewResponse,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def parent_child_attendance_overview(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can view attendance",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    svc = AttendanceExcusalService(db)
    return await svc.guardian_overview(student_id=student_id, tenant_id=tenant.tenant_id)


@router.post(
    "/parent/children/{student_id}/excusal-requests",
    response_model=AttendanceExcusalRow,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("students", "view")],
)
async def parent_create_excusal_request(
    student_id: UUID,
    data: AttendanceExcusalCreate,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can submit excusal requests",
        )
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent or homeschool parent role required",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    svc = AttendanceExcusalService(db)
    return await svc.create_excusal(
        student_id=student_id,
        tenant_id=tenant.tenant_id,
        guardian_user_id=identity.id,
        data=data,
    )


@router.get(
    "/attendance-excusal-requests",
    response_model=list[AttendanceExcusalStaffRow],
    dependencies=[_require_tenant(), require_permission("attendance", "view")],
)
async def list_attendance_excusal_requests_staff(
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
    status_filter: str | None = Query(None, description="pending, approved, or denied"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can list excusal requests",
        )
    svc = AttendanceExcusalService(db)
    return await svc.list_for_staff(
        tenant_id=tenant.tenant_id,
        identity=identity,
        effective_role=tenant.role,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )


@router.patch(
    "/attendance-excusal-requests/{excusal_id}",
    response_model=AttendanceExcusalStaffRow,
    dependencies=[_require_tenant(), require_permission("attendance", "edit")],
)
async def review_attendance_excusal_request(
    excusal_id: UUID,
    data: AttendanceExcusalReview,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace users can review excusal requests",
        )
    svc = AttendanceExcusalService(db)
    return await svc.review_excusal(
        excusal_id=excusal_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        effective_role=tenant.role,
        data=data,
    )
