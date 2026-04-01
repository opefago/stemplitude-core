"""Classroom schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ClassroomBase(BaseModel):
    """Base classroom schema."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the classroom.",
    )
    program_id: UUID | None = Field(
        None,
        description="ID of the program this classroom belongs to.",
    )
    curriculum_id: UUID | None = Field(
        None,
        description="Optional curriculum ID linked to this classroom.",
    )
    instructor_id: UUID | None = Field(
        None,
        description="ID of the instructor assigned to this classroom.",
    )
    mode: str = Field(
        default="online",
        max_length=20,
        description="Delivery mode: 'online' or 'in-person'.",
    )
    recurrence_type: str | None = Field(
        None,
        max_length=20,
        description="Recurrence pattern for scheduled sessions (e.g., weekly, daily).",
    )
    meeting_provider: str | None = Field(
        None,
        max_length=20,
        description="Video meeting provider (e.g., 'zoom', 'meet', 'teams').",
    )
    meeting_link: str | None = Field(
        None,
        max_length=500,
        description="URL for joining the virtual meeting.",
    )
    location_address: str | None = Field(
        None,
        max_length=500,
        description="Physical address for in-person classrooms.",
    )
    schedule: dict | None = Field(
        None,
        description="JSON object defining the class schedule.",
    )
    starts_at: datetime | None = Field(
        None,
        description="When the classroom term/series starts.",
    )
    ends_at: datetime | None = Field(
        None,
        description="When the classroom term/series ends.",
    )
    recurrence_rule: str | None = Field(
        None,
        max_length=200,
        description="iCal-style recurrence rule for recurring sessions.",
    )
    timezone: str | None = Field(
        None,
        max_length=50,
        description="IANA timezone for scheduling (e.g., 'America/New_York').",
    )
    max_students: int | None = Field(
        None,
        description="Maximum number of students that can enroll. Omit, null, or 0 for no limit.",
    )
    is_active: bool = Field(
        True,
        description="Whether the classroom is currently active.",
    )

    @field_validator("max_students", mode="before")
    @classmethod
    def normalize_max_students(cls, v: object) -> object:
        """0 means unlimited (stored as NULL)."""
        if v is None:
            return None
        if v == 0 or v == "0":
            return None
        if isinstance(v, int) and v < 0:
            raise ValueError("max_students must be non-negative")
        return v


class ClassroomCreate(ClassroomBase):
    """Schema for creating a classroom."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Monday Robotics - Beginners",
                    "program_id": "123e4567-e89b-12d3-a456-426614174000",
                    "instructor_id": "123e4567-e89b-12d3-a456-426614174001",
                    "mode": "online",
                    "meeting_provider": "zoom",
                    "max_students": 15,
                    "timezone": "America/New_York",
                    "is_active": True,
                }
            ]
        }
    )


class ClassroomUpdate(BaseModel):
    """Schema for updating a classroom."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated display name of the classroom.",
    )
    program_id: UUID | None = Field(
        None,
        description="Updated program ID.",
    )
    curriculum_id: UUID | None = Field(
        None,
        description="Updated curriculum ID.",
    )
    instructor_id: UUID | None = Field(
        None,
        description="Updated instructor ID.",
    )
    mode: str | None = Field(
        None,
        max_length=20,
        description="Updated delivery mode: 'online' or 'in-person'.",
    )
    recurrence_type: str | None = Field(
        None,
        max_length=20,
        description="Updated recurrence pattern.",
    )
    meeting_provider: str | None = Field(
        None,
        max_length=20,
        description="Updated meeting provider.",
    )
    meeting_link: str | None = Field(
        None,
        max_length=500,
        description="Updated meeting URL.",
    )
    location_address: str | None = Field(
        None,
        max_length=500,
        description="Updated physical address.",
    )
    schedule: dict | None = Field(
        None,
        description="Updated schedule object.",
    )
    starts_at: datetime | None = Field(
        None,
        description="Updated start datetime.",
    )
    ends_at: datetime | None = Field(
        None,
        description="Updated end datetime.",
    )
    recurrence_rule: str | None = Field(
        None,
        max_length=200,
        description="Updated recurrence rule.",
    )
    timezone: str | None = Field(
        None,
        max_length=50,
        description="Updated timezone.",
    )
    max_students: int | None = Field(
        None,
        description="Updated maximum students. Null or 0 clears the limit (unlimited).",
    )
    is_active: bool | None = Field(
        None,
        description="Updated active status.",
    )
    settings: dict | None = Field(
        None,
        description=(
            "Classroom-level settings JSON (e.g. attendance policy). "
            "Merged into the stored settings when provided."
        ),
    )

    @field_validator("max_students", mode="before")
    @classmethod
    def normalize_max_students_update(cls, v: object) -> object:
        if v is None:
            return None
        if v == 0 or v == "0":
            return None
        if isinstance(v, int) and v < 0:
            raise ValueError("max_students must be non-negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Monday Robotics - Beginners",
                    "mode": "online",
                    "meeting_provider": "zoom",
                    "max_students": 15,
                    "timezone": "America/New_York",
                }
            ]
        }
    )


class ClassroomResponse(ClassroomBase):
    """Classroom response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the classroom.")
    tenant_id: UUID = Field(..., description="Tenant that owns the classroom.")
    program_name: str | None = Field(None, description="Resolved program name for display.")
    program_start_date: str | None = Field(None, description="Inherited term start date from the parent program (ISO date).")
    program_end_date: str | None = Field(None, description="Inherited term end date from the parent program (ISO date).")
    curriculum_title: str | None = Field(None, description="Resolved curriculum title for display.")
    join_code: str = Field(..., description="Short code for students to join the classroom.")
    external_meeting_id: str | None = Field(
        None,
        description="ID from the meeting provider (e.g., Zoom meeting ID).",
    )
    meeting_auto_generated: bool = Field(
        ...,
        description="Whether the meeting link was auto-generated by the provider.",
    )
    settings: dict = Field(
        default_factory=dict,
        description="Classroom-level settings including attendance policy.",
    )
    deleted_at: datetime | None = Field(
        None,
        description="Soft-delete timestamp if the classroom was deleted.",
    )
    created_at: datetime = Field(..., description="When the classroom was created.")
    updated_at: datetime = Field(..., description="When the classroom was last updated.")


class ClassroomNameCheckResponse(BaseModel):
    """Duplicate classroom name check response."""

    exists: bool = Field(..., description="Whether a classroom with this name already exists.")


class ClassroomInstructorConflictCheckRequest(BaseModel):
    """Payload to validate instructor schedule overlap."""

    instructor_id: UUID = Field(..., description="Instructor user ID.")
    selected_days: list[str] = Field(default_factory=list, description="Selected meeting weekdays.")
    start_time: str = Field(..., description="Proposed start time in HH:MM format.")
    end_time: str = Field(..., description="Proposed end time in HH:MM format.")
    exclude_classroom_id: UUID | None = Field(
        None,
        description="Optional classroom ID to exclude from overlap checks.",
    )


class ClassroomInstructorConflictCheckResponse(BaseModel):
    """Instructor schedule conflict check response."""

    has_conflict: bool = Field(..., description="Whether overlap exists.")
    conflicting_classroom_ids: list[UUID] = Field(
        default_factory=list,
        description="Classroom IDs with conflicting schedules.",
    )


class ClassroomBulkAssignCurriculumRequest(BaseModel):
    """Bulk assign curriculum to classes."""

    classroom_ids: list[UUID] = Field(default_factory=list, description="Classroom IDs to update.")
    curriculum_id: UUID | None = Field(
        None,
        description="Curriculum ID to assign. Null unlinks class from curriculum.",
    )


class ClassroomBulkAssignCurriculumResponse(BaseModel):
    """Bulk assignment summary."""

    updated_count: int = Field(..., description="Number of classrooms updated.")


class EnrollStudentRequest(BaseModel):
    """Request to enroll a student in a classroom."""

    student_id: UUID = Field(..., description="ID of the student to enroll.")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "student_id": "123e4567-e89b-12d3-a456-426614174002",
                }
            ]
        }
    )


class ClassroomStudentResponse(BaseModel):
    """Enrolled student response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the enrollment record.")
    classroom_id: UUID = Field(..., description="ID of the classroom.")
    student_id: UUID = Field(..., description="ID of the enrolled student.")
    enrolled_at: datetime = Field(..., description="When the student was enrolled.")


class ClassroomRosterStudentResponse(BaseModel):
    """Classroom roster entry with student profile details."""

    id: UUID = Field(..., description="Student identifier.")
    first_name: str = Field(..., description="Student first name.")
    last_name: str = Field(..., description="Student last name.")
    email: str | None = Field(None, description="Student email if available.")
    display_name: str | None = Field(None, description="Optional student display name.")
    enrolled_at: datetime = Field(..., description="When the student was enrolled.")


class RecordAttendanceRequest(BaseModel):
    """Request to record attendance."""

    student_id: UUID = Field(..., description="ID of the student.")
    session_id: UUID = Field(..., description="ID of the session.")
    status: str = Field(
        default="present",
        max_length=20,
        description="Attendance status: 'present', 'absent', 'late', or 'excused'.",
    )
    notes: str | None = Field(
        None,
        max_length=500,
        description="Optional notes about the attendance record.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "student_id": "123e4567-e89b-12d3-a456-426614174002",
                    "session_id": "123e4567-e89b-12d3-a456-426614174003",
                    "status": "present",
                    "notes": None,
                }
            ]
        }
    )


class AttendanceResponse(BaseModel):
    """Attendance record response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the attendance record.")
    session_id: UUID = Field(..., description="ID of the session.")
    classroom_id: UUID = Field(..., description="ID of the classroom.")
    student_id: UUID = Field(..., description="ID of the student.")
    tenant_id: UUID = Field(..., description="Tenant that owns the record.")
    status: str = Field(..., description="Attendance status.")
    notes: str | None = Field(None, description="Optional notes.")
    created_at: datetime = Field(..., description="When the record was created.")


class RegenerateMeetingRequest(BaseModel):
    """Request to regenerate meeting link via a provider."""

    provider: str = Field(
        ...,
        max_length=20,
        description="Meeting provider: 'zoom', 'meet', or 'teams'.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"provider": "zoom"},
                {"provider": "meet"},
                {"provider": "teams"},
            ]
        }
    )


class RegenerateMeetingResponse(BaseModel):
    """Response after regenerating meeting link."""

    meeting_link: str | None = Field(
        None,
        description="New meeting URL from the provider.",
    )
    join_code: str = Field(..., description="Classroom join code.")
    external_meeting_id: str | None = Field(
        None,
        description="External meeting ID from the provider.",
    )
    meeting_provider: str | None = Field(
        None,
        description="Provider that created the meeting (zoom, google, microsoft).",
    )


class CreateSessionRequest(BaseModel):
    """Request to create a classroom session."""

    session_start: datetime = Field(
        ...,
        description="Start time of the session (ISO 8601 datetime).",
    )
    session_end: datetime = Field(
        ...,
        description="End time of the session (ISO 8601 datetime).",
    )
    meeting_link: str | None = Field(
        None,
        max_length=500,
        description="Optional custom meeting URL for this session.",
    )
    notes: str | None = Field(
        None,
        max_length=2000,
        description="Optional notes for this session.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "session_start": "2025-03-17T14:00:00Z",
                    "session_end": "2025-03-17T15:30:00Z",
                    "meeting_link": "https://zoom.us/j/123456789",
                    "notes": "Week 3 - Sensors module",
                }
            ]
        }
    )


class RescheduleSessionRequest(BaseModel):
    """Request to reschedule a session to new times."""

    session_start: datetime = Field(..., description="New start time (ISO 8601 datetime).")
    session_end: datetime = Field(..., description="New end time (ISO 8601 datetime).")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "session_start": "2025-03-20T14:00:00Z",
                    "session_end": "2025-03-20T15:30:00Z",
                }
            ]
        }
    )


class SessionEditRequest(BaseModel):
    """Request to edit session details (time, meeting link, notes)."""

    session_start: datetime | None = Field(None, description="New start time (ISO 8601 datetime).")
    session_end: datetime | None = Field(None, description="New end time (ISO 8601 datetime).")
    meeting_link: str | None = Field(None, max_length=500, description="Meeting URL.")
    notes: str | None = Field(None, max_length=2000, description="Session notes.")


class SessionResponse(BaseModel):
    """Classroom session response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the session.")
    classroom_id: UUID = Field(..., description="ID of the classroom.")
    tenant_id: UUID = Field(..., description="Tenant that owns the session.")
    session_start: datetime = Field(..., description="Start time of the session.")
    session_end: datetime = Field(..., description="End time of the session.")
    status: str = Field(..., description="Session status (e.g., scheduled, completed, canceled).")
    meeting_link: str | None = Field(None, description="Meeting URL for the session.")
    external_meeting_id: str | None = Field(
        None,
        description="External meeting ID from the provider.",
    )
    notes: str | None = Field(None, description="Session notes.")
    session_content: dict | None = Field(
        None,
        description="Session-linked shared/downloadable asset references.",
    )
    canceled_at: datetime | None = Field(
        None,
        description="When the session was canceled, if applicable.",
    )
    classroom_name: str | None = Field(
        None,
        description="Class display name when the list endpoint joins classroom metadata.",
    )


class SessionPresenceHeartbeatRequest(BaseModel):
    """Heartbeat payload to keep session presence active."""

    status: str = Field(
        default="active",
        max_length=20,
        description="Presence status: 'active' (default), 'left', or 'in_lab'.",
    )
    lab_type: str | None = Field(
        None,
        max_length=60,
        description="Active lab identifier when status is 'in_lab'.",
    )


class SessionPresenceSummaryResponse(BaseModel):
    """Current live presence summary for a classroom session."""

    session_id: UUID = Field(..., description="Session identifier.")
    active_students: int = Field(..., ge=0, description="Active students in session.")
    active_instructors: int = Field(..., ge=0, description="Active instructors in session.")
    active_users: int = Field(..., ge=0, description="Other active users in session.")
    active_total: int = Field(..., ge=0, description="Total active participants.")
    latest_seen_at: datetime | None = Field(
        None,
        description="Latest heartbeat timestamp from any participant.",
    )
    auto_end_due_at: datetime | None = Field(
        None,
        description="When the session will auto-end if no one joins before then.",
    )


class SessionPresenceParticipantResponse(BaseModel):
    """Active participant currently present in a session."""

    actor_id: UUID = Field(..., description="Student/User identifier.")
    actor_type: str = Field(..., description="Participant type: student, instructor, or user.")
    display_name: str = Field(..., description="Display name for participant.")
    email: str | None = Field(None, description="Email if available.")
    last_seen_at: datetime = Field(..., description="Last active heartbeat timestamp.")
    in_lab: bool = Field(False, description="True when the participant is working in a virtual lab.")
    lab_type: str | None = Field(None, description="Which lab the participant is currently in.")


class EndSessionRequest(BaseModel):
    """Request to end a currently active classroom session."""

    force_end_for_all: bool = Field(
        default=False,
        description="Must be true when ending while students are still active.",
    )


class SessionTextAssignment(BaseModel):
    """A free-form text assignment attached to a session."""

    id: str = Field(..., description="Client-generated UUID for the assignment.")
    title: str = Field(..., min_length=1, max_length=200, description="Assignment title.")
    instructions: str | None = Field(None, max_length=2000, description="Assignment instructions.")
    due_at: datetime | None = Field(None, description="Optional due date/time.")
    lab_id: str | None = Field(None, max_length=100, description="Optional lab ID from classroom's permitted labs.")
    requires_lab: bool = Field(
        default=False,
        description="Whether this assignment requires students to complete lab work.",
    )
    requires_assets: bool = Field(
        default=False,
        description="Whether this assignment requires students to attach supporting assets/files.",
    )
    allow_edit_after_submit: bool = Field(
        default=False,
        description="Whether students can edit/resubmit after a submitted status exists.",
    )
    created_by_id: UUID | None = Field(None, description="Actor ID that created the assignment.")
    created_by_type: str | None = Field(None, max_length=50, description="Actor type that created the assignment.")
    created_by_name: str | None = Field(None, max_length=200, description="Display name of the actor that created the assignment.")
    created_at: datetime | None = Field(None, description="When the assignment was created.")


class SessionResourceEntry(BaseModel):
    """Metadata for a resource attached to a classroom session."""

    asset_id: UUID = Field(..., description="Attached asset ID.")
    name: str | None = Field(None, max_length=255, description="Display name of the asset at attach time.")
    source: str | None = Field(
        default="library",
        max_length=20,
        description="How the file was attached: library or upload.",
    )
    attached_by_id: UUID | None = Field(None, description="Actor ID that attached this resource.")
    attached_by_type: str | None = Field(None, max_length=50, description="Actor type that attached this resource.")
    attached_by_name: str | None = Field(None, max_length=200, description="Display name of the actor that attached this resource.")
    attached_at: datetime | None = Field(None, description="When this resource was attached.")


class SessionContentUpdateRequest(BaseModel):
    """Request to update session-linked content assets."""

    shared_asset_ids: list[UUID] | None = Field(
        None,
        description="Asset IDs visible in shared content/presentation.",
    )
    downloadable_asset_ids: list[UUID] | None = Field(
        None,
        description="Asset IDs available in resource downloads.",
    )
    text_assignments: list[SessionTextAssignment] | None = Field(
        None,
        description="Free-form text assignments attached to the session.",
    )
    resource_entries: list[SessionResourceEntry] | None = Field(
        None,
        description="Optional metadata entries for attached resources.",
    )


class SessionChatCreateRequest(BaseModel):
    """Create a chat message for a classroom session."""

    message: str = Field(..., min_length=1, max_length=2000, description="Chat message text.")


class SessionActivityCreateRequest(BaseModel):
    """Create a classroom session activity/callout event."""

    activity_type: str = Field(
        ...,
        max_length=30,
        description="One of: points_awarded, high_five, callout.",
    )
    student_id: UUID = Field(..., description="Target student receiving recognition.")
    message: str | None = Field(None, max_length=1000, description="Optional note for activity.")
    points_delta: int | None = Field(None, ge=1, le=1000, description="Points awarded.")


class SessionEventResponse(BaseModel):
    """Session event response for chat and activity timeline."""

    id: UUID = Field(..., description="Event ID.")
    session_id: UUID = Field(..., description="Session ID.")
    classroom_id: UUID = Field(..., description="Classroom ID.")
    tenant_id: UUID = Field(..., description="Tenant ID.")
    event_type: str = Field(..., description="Event type.")
    sequence: int = Field(..., ge=1, description="Monotonic per-session event sequence number.")
    correlation_id: str | None = Field(None, description="Optional idempotency/correlation key.")
    actor_id: UUID = Field(..., description="Actor ID creating event.")
    actor_type: str = Field(..., description="Actor type.")
    actor_display_name: str = Field(..., description="Actor display name.")
    student_id: UUID | None = Field(None, description="Target student ID if applicable.")
    student_display_name: str | None = Field(None, description="Target student display name if applicable.")
    message: str | None = Field(None, description="Chat or activity message.")
    points_delta: int | None = Field(None, description="Points granted in this event.")
    metadata_: dict | None = Field(None, alias="metadata", description="Additional event metadata.")
    created_at: datetime = Field(..., description="Event creation timestamp.")


class SessionStateResponse(BaseModel):
    """Snapshot of mutable realtime classroom session state."""

    session_id: UUID = Field(..., description="Session identifier.")
    classroom_id: UUID = Field(..., description="Classroom identifier.")
    tenant_id: UUID = Field(..., description="Tenant identifier.")
    active_lab: str | None = Field(None, description="Currently selected lab key.")
    assignments: list[dict] = Field(default_factory=list, description="Current assignment set for session.")
    metadata: dict = Field(default_factory=dict, description="Arbitrary session state metadata.")
    updated_at: datetime | None = Field(None, description="Last state update timestamp.")


class RealtimeEventEnvelope(BaseModel):
    """Unified websocket event envelope."""

    event_id: UUID = Field(..., description="Persistent event row id.")
    session_id: UUID = Field(..., description="Session identifier.")
    classroom_id: UUID = Field(..., description="Classroom identifier.")
    tenant_id: UUID = Field(..., description="Tenant identifier.")
    event_type: str = Field(..., description="Event name.")
    sequence: int = Field(..., ge=1, description="Monotonic per-session sequence.")
    occurred_at: datetime = Field(..., description="Server timestamp for event creation.")
    correlation_id: str | None = Field(None, description="Optional caller-provided idempotency key.")
    actor: dict = Field(default_factory=dict, description="Actor identity summary.")
    payload: dict = Field(default_factory=dict, description="Event payload.")


class RealtimeSessionSnapshotResponse(BaseModel):
    """Initial websocket snapshot with replay cursor and state."""

    session: SessionResponse = Field(..., description="Current session object.")
    presence: SessionPresenceSummaryResponse = Field(..., description="Current presence summary.")
    participants: list[SessionPresenceParticipantResponse] = Field(
        default_factory=list, description="Current active participants."
    )
    state: SessionStateResponse = Field(..., description="Session mutable state snapshot.")
    latest_sequence: int = Field(..., ge=0, description="Latest persisted event sequence.")
    events: list[RealtimeEventEnvelope] = Field(
        default_factory=list, description="Optional replay events for reconnect."
    )


# ── Assignment / grading schemas ─────────────────────────────────────────────

class ClassroomAssignmentResponse(BaseModel):
    """Flattened assignment as seen by an instructor."""

    id: str
    title: str
    instructions: str | None = None
    due_at: str | None = None
    lab_id: str | None = None
    requires_lab: bool = False
    requires_assets: bool = False
    allow_edit_after_submit: bool = False
    session_id: str
    session_start: str
    session_end: str
    session_status: str
    submission_count: int = 0


class RubricCriterionInput(BaseModel):
    """Single row in a scoring rubric (optional breakdown alongside holistic score)."""

    criterion_id: str = Field(..., min_length=1, max_length=80, description="Stable id, e.g. clarity.")
    label: str | None = Field(None, max_length=200, description="Human-readable criterion name.")
    max_points: int = Field(..., ge=1, le=1000, description="Maximum points for this row.")
    points_awarded: int = Field(..., ge=0, description="Points earned (must be <= max_points).")

    model_config = ConfigDict(extra="forbid")


class SubmissionGradeRequest(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Numeric grade 0–100.")
    feedback: str | None = Field(None, max_length=1000, description="Optional feedback note.")
    assignment_id: str | None = Field(None, description="Assignment this grade applies to.")
    rubric: list[RubricCriterionInput] | None = Field(
        default=None,
        description="Optional rubric rows; compliance is aggregated in analytics as points/max per submission.",
    )

    @model_validator(mode="after")
    def _rubric_points_cap(self):
        if self.rubric:
            for row in self.rubric:
                if row.points_awarded > row.max_points:
                    raise ValueError(
                        f"points_awarded ({row.points_awarded}) exceeds max_points ({row.max_points}) "
                        f"for criterion {row.criterion_id!r}"
                    )
        return self


class RubricCriterionScore(BaseModel):
    criterion_id: str
    label: str | None = None
    max_points: int
    points_awarded: int


class SubmissionRecord(BaseModel):
    """A single student submission as seen by an instructor."""

    event_id: str
    session_id: str
    assignment_id: str | None
    student_id: str
    student_display_name: str | None = None
    content: str
    status: str
    submitted_at: str
    grade: int | None = None
    feedback: str | None = None
    graded_at: str | None = None
    rubric: list[RubricCriterionScore] | None = None
    preview_image: str | None = Field(
        default=None,
        description="Optional data URL snapshot of lab work (not sent over realtime).",
    )
    lab_id: str | None = Field(default=None, description="Source lab identifier when provided.")
