"""Classroom router."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.classrooms.schemas import (
    ClassroomAssignmentResponse,
    ClassroomCreate,
    ClassroomRosterStudentResponse,
    ClassroomResponse,
    ClassroomStudentResponse,
    ClassroomUpdate,
    ClassroomNameCheckResponse,
    ClassroomInstructorConflictCheckRequest,
    ClassroomInstructorConflictCheckResponse,
    ClassroomBulkAssignCurriculumRequest,
    ClassroomBulkAssignCurriculumResponse,
    CreateSessionRequest,
    EndSessionRequest,
    EnrollStudentRequest,
    RecordAttendanceRequest,
    RegenerateMeetingRequest,
    RegenerateMeetingResponse,
    RescheduleSessionRequest,
    SessionEditRequest,
    SessionPresenceHeartbeatRequest,
    SessionPresenceParticipantResponse,
    SessionPresenceSummaryResponse,
    SessionActivityCreateRequest,
    SessionChatCreateRequest,
    SessionContentUpdateRequest,
    SessionEventResponse,
    SessionResponse,
    AttendanceResponse,
    SubmissionGradeRequest,
    SubmissionRecord,
)
from app.dependencies import CurrentIdentity, get_current_identity
from app.classrooms.service import ClassroomService
from app.classrooms.realtime import classroom_session_ws_handler

router = APIRouter()


def _require_tenant():
    """Dependency that requires tenant context (X-Tenant-ID)."""

    async def _get(request: Request) -> TenantContext:
        return get_tenant_context(request)

    return Depends(_get)


@router.post(
    "/",
    response_model=ClassroomResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "create")],
)
async def create_classroom(
    data: ClassroomCreate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a classroom."""
    service = ClassroomService(db)
    return await service.create(data, tenant.tenant_id)


@router.get(
    "/",
    response_model=list[ClassroomResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_classrooms(
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    is_active: bool | None = Query(None),
    program_id: UUID | None = Query(None),
    curriculum_id: UUID | None = Query(None),
):
    """List classrooms."""
    service = ClassroomService(db)
    return await service.list(
        tenant.tenant_id,
        skip=skip,
        limit=limit,
        is_active=is_active,
        program_id=program_id,
        curriculum_id=curriculum_id,
    )


@router.get(
    "/validate/name",
    response_model=ClassroomNameCheckResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def validate_classroom_name(
    name: str = Query(..., min_length=1),
    exclude_classroom_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Check whether classroom name already exists in tenant."""
    service = ClassroomService(db)
    exists = await service.check_duplicate_name(
        tenant_id=tenant.tenant_id,
        name=name,
        exclude_classroom_id=exclude_classroom_id,
    )
    return ClassroomNameCheckResponse(exists=exists)


@router.post(
    "/validate/instructor-conflict",
    response_model=ClassroomInstructorConflictCheckResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def validate_instructor_conflict(
    data: ClassroomInstructorConflictCheckRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Check whether selected schedule overlaps instructor existing classrooms."""
    service = ClassroomService(db)
    conflicts = await service.check_instructor_schedule_conflicts(
        tenant_id=tenant.tenant_id,
        instructor_id=data.instructor_id,
        selected_days=data.selected_days,
        start_time=data.start_time,
        end_time=data.end_time,
        exclude_classroom_id=data.exclude_classroom_id,
    )
    return ClassroomInstructorConflictCheckResponse(
        has_conflict=len(conflicts) > 0,
        conflicting_classroom_ids=conflicts,
    )


@router.post(
    "/bulk-assign-curriculum",
    response_model=ClassroomBulkAssignCurriculumResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def bulk_assign_curriculum(
    data: ClassroomBulkAssignCurriculumRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Bulk assign/unassign curriculum links for classrooms."""
    service = ClassroomService(db)
    updated_count = await service.bulk_assign_curriculum(
        tenant_id=tenant.tenant_id,
        classroom_ids=data.classroom_ids,
        curriculum_id=data.curriculum_id,
    )
    return ClassroomBulkAssignCurriculumResponse(updated_count=updated_count)


@router.get(
    "/{id}",
    response_model=ClassroomResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def get_classroom(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get classroom by ID."""
    service = ClassroomService(db)
    return await service.get_by_id(id, tenant.tenant_id)


@router.patch(
    "/{id}",
    response_model=ClassroomResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def update_classroom(
    id: UUID,
    data: ClassroomUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Update a classroom."""
    service = ClassroomService(db)
    return await service.update(id, data, tenant.tenant_id)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def delete_classroom(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Soft-delete a classroom (sets is_active=False, deleted_at=now)."""
    service = ClassroomService(db)
    await service.delete(id, tenant.tenant_id)


@router.post(
    "/{id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def create_session(
    id: UUID,
    data: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Create a classroom session (required before recording attendance)."""
    service = ClassroomService(db)
    return await service.create_session(id, data, tenant.tenant_id)


@router.get(
    "/{id}/sessions",
    response_model=list[SessionResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_sessions(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    limit: int = Query(100, ge=1, le=500),
):
    """List sessions for a classroom."""
    service = ClassroomService(db)
    return await service.list_sessions(id, tenant.tenant_id, limit=limit)


@router.post(
    "/{id}/sessions/{session_id}/presence",
    response_model=SessionPresenceSummaryResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def heartbeat_session_presence(
    id: UUID,
    session_id: UUID,
    data: SessionPresenceHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Send session presence heartbeat or mark participant left."""
    service = ClassroomService(db)
    return await service.heartbeat_session_presence(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )


@router.get(
    "/{id}/sessions/{session_id}/presence",
    response_model=SessionPresenceSummaryResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def get_session_presence(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get current participant presence summary for a session."""
    service = ClassroomService(db)
    return await service.get_session_presence_summary(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )


@router.get(
    "/{id}/sessions/{session_id}/presence/participants",
    response_model=list[SessionPresenceParticipantResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def get_session_presence_participants(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Get active participant roster for a live session."""
    service = ClassroomService(db)
    return await service.get_session_presence_participants(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )


@router.post(
    "/{id}/sessions/{session_id}/end",
    response_model=SessionResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def end_session(
    id: UUID,
    session_id: UUID,
    data: EndSessionRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """End a session early; can force end for all participants."""
    service = ClassroomService(db)
    return await service.end_session(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        data=data,
        identity=identity,
    )


@router.patch(
    "/{id}/sessions/{session_id}/content",
    response_model=SessionResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def update_session_content(
    id: UUID,
    session_id: UUID,
    data: SessionContentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Update session-linked shared/downloadable assets."""
    service = ClassroomService(db)
    return await service.update_session_content(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )


@router.get(
    "/{id}/sessions/{session_id}/events",
    response_model=list[SessionEventResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_session_events(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    event_type: str | None = Query(None),
    limit: int = Query(500, ge=1, le=1000),
):
    service = ClassroomService(db)
    event_types = [event_type] if event_type else None
    return await service.list_session_events(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        event_types=event_types,
        limit=limit,
    )


@router.post(
    "/{id}/sessions/{session_id}/chat",
    response_model=SessionEventResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def create_session_chat(
    id: UUID,
    session_id: UUID,
    data: SessionChatCreateRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = ClassroomService(db)
    return await service.create_session_chat_event(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )


@router.post(
    "/{id}/sessions/{session_id}/activities",
    response_model=SessionEventResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def create_session_activity(
    id: UUID,
    session_id: UUID,
    data: SessionActivityCreateRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    service = ClassroomService(db)
    return await service.create_session_activity_event(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        data=data,
    )


@router.post(
    "/{id}/sessions/{session_id}/cancel",
    response_model=SessionResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def cancel_session(
    id: UUID,
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Cancel a scheduled session. Parents need tenant policy allow_cancel=true."""
    from sqlalchemy import select
    from app.tenants.models import Tenant

    tenant_obj = await db.execute(select(Tenant).where(Tenant.id == tenant.tenant_id))
    tenant_row = tenant_obj.scalar_one_or_none()
    tenant_settings = tenant_row.settings if tenant_row else {}
    caller_role = getattr(getattr(request.state, "current_identity", None), "role_slug", None)

    service = ClassroomService(db)
    return await service.cancel_session(
        id, session_id, tenant.tenant_id,
        tenant_settings=tenant_settings,
        caller_role=caller_role,
    )


@router.patch(
    "/{id}/sessions/{session_id}",
    response_model=SessionResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def update_session(
    id: UUID,
    session_id: UUID,
    data: SessionEditRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Edit session details (time, meeting link, notes). Instructors only."""
    service = ClassroomService(db)
    return await service.update_session_details(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        data=data,
    )


@router.delete(
    "/{id}/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def delete_session(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Soft-delete a session. Cannot delete active sessions."""
    service = ClassroomService(db)
    await service.delete_session(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )


@router.post(
    "/{id}/enroll",
    response_model=ClassroomStudentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def enroll_student(
    id: UUID,
    data: EnrollStudentRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Enroll a student in a classroom."""
    service = ClassroomService(db)
    return await service.enroll_student(id, data, tenant.tenant_id)


@router.delete(
    "/{id}/students/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def unenroll_student(
    id: UUID,
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Unenroll a student from a classroom."""
    service = ClassroomService(db)
    await service.unenroll_student(id, student_id, tenant.tenant_id)


@router.get(
    "/{id}/students",
    response_model=list[ClassroomStudentResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_students(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List enrolled students."""
    service = ClassroomService(db)
    return await service.list_students(id, tenant.tenant_id)


@router.get(
    "/{id}/roster",
    response_model=list[ClassroomRosterStudentResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_roster(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """List classroom roster with student profile details."""
    service = ClassroomService(db)
    return await service.list_student_roster(id, tenant.tenant_id)


@router.post(
    "/{id}/attendance",
    response_model=AttendanceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def record_attendance(
    id: UUID,
    data: RecordAttendanceRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Record attendance for a student in a session."""
    service = ClassroomService(db)
    return await service.record_attendance(id, data, tenant.tenant_id)


@router.get(
    "/{id}/attendance",
    response_model=list[AttendanceResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def get_attendance(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    session_id: UUID | None = Query(None),
):
    """Get attendance records for a classroom."""
    service = ClassroomService(db)
    return await service.list_attendance(
        id, tenant.tenant_id, session_id=session_id
    )


@router.post(
    "/{id}/sessions/{session_id}/attendance/calculate",
    response_model=list[AttendanceResponse],
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def calculate_session_attendance(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    """Manually trigger attendance calculation for a session.

    Uses the effective attendance policy (classroom > program > tenant) to mark
    each enrolled student as present or absent based on their presence data.
    Existing attendance records are overwritten.
    """
    service = ClassroomService(db)
    results = await service.auto_calculate_session_attendance(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
    )
    await db.commit()
    return results


@router.post(
    "/{id}/regenerate-meeting",
    response_model=RegenerateMeetingResponse,
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def regenerate_meeting(
    id: UUID,
    data: RegenerateMeetingRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Regenerate meeting link via the specified provider (zoom, meet, teams).

    Creates a real meeting using the instructor's linked OAuth account.
    If no instructor is assigned, uses the caller's account.
    """
    service = ClassroomService(db)
    return await service.regenerate_meeting(id, tenant.tenant_id, data, identity.id)


@router.get(
    "/{id}/assignments",
    response_model=list[ClassroomAssignmentResponse],
    dependencies=[_require_tenant()],
)
async def list_classroom_assignments(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """List all assignments across every session of a classroom (instructor view)."""
    service = ClassroomService(db)
    items = await service.list_classroom_assignments(
        classroom_id=id, tenant_id=tenant.tenant_id, identity=identity
    )
    return [ClassroomAssignmentResponse.model_validate(i) for i in items]


@router.get(
    "/{id}/sessions/{session_id}/submissions",
    response_model=list[SubmissionRecord],
    dependencies=[_require_tenant(), require_permission("classrooms", "view")],
)
async def list_session_submissions(
    id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    assignment_id: str | None = Query(None, description="Filter by assignment id."),
):
    """List student submissions for a session (optionally filtered by assignment)."""
    service = ClassroomService(db)
    items = await service.list_session_submissions(
        classroom_id=id,
        session_id=session_id,
        tenant_id=tenant.tenant_id,
        assignment_id=assignment_id,
    )
    return [SubmissionRecord.model_validate(i) for i in items]


@router.post(
    "/{id}/sessions/{session_id}/submissions/{event_id}/grade",
    dependencies=[_require_tenant(), require_permission("classrooms", "update")],
)
async def grade_submission(
    id: UUID,
    session_id: UUID,
    event_id: UUID,
    data: SubmissionGradeRequest,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Record a grade for a student submission."""
    service = ClassroomService(db)
    return await service.grade_submission(
        classroom_id=id,
        session_id=session_id,
        submission_event_id=event_id,
        tenant_id=tenant.tenant_id,
        identity=identity,
        score=data.score,
        feedback=data.feedback,
        assignment_id=data.assignment_id,
    )


@router.websocket("/{id}/sessions/{session_id}/ws")
async def classroom_session_ws(
    websocket: WebSocket,
    id: UUID,
    session_id: UUID,
):
    preserve_in_lab = websocket.query_params.get("preserve_in_lab", "0") == "1"
    await classroom_session_ws_handler(
        websocket,
        classroom_id=id,
        session_id=session_id,
        preserve_in_lab=preserve_in_lab,
    )
