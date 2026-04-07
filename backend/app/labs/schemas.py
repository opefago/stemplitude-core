"""Labs schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProjectCreate(BaseModel):
    """Schema for creating a project (multipart: file + metadata)."""

    title: str = Field(
        ...,
        max_length=200,
        description="Display title of the student's project.",
    )
    lab_id: UUID | None = Field(
        None,
        description="ID of the lab this project is associated with.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "My Line Follower Robot",
                    "lab_id": "123e4567-e89b-12d3-a456-426614174000",
                }
            ]
        }
    )


class ProjectResponse(BaseModel):
    """Project response schema."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(..., description="Unique identifier for the project.")
    student_id: UUID = Field(..., description="ID of the student who created the project.")
    lab_id: UUID | None = Field(
        None,
        description="ID of the lab this project is associated with.",
    )
    tenant_id: UUID = Field(..., description="Tenant that owns the project.")
    title: str = Field(..., description="Display title of the project.")
    blob_key: str | None = Field(
        None,
        description="Storage key for the project file (e.g., S3 object key).",
    )
    blob_url: str | None = Field(
        None,
        description="Pre-signed or public URL to access the project file.",
    )
    metadata_: dict | None = Field(
        None,
        serialization_alias="metadata",
        description="Additional metadata or project metadata.",
    )
    status: str = Field("submitted", description="Project status: draft, submitted, graded, returned.")
    save_kind: str = Field("checkpoint", description="Save mode: autosave or checkpoint.")
    revision: int = Field(1, description="Monotonic project revision counter.")
    source_project_id: UUID | None = Field(
        None,
        description="Optional parent project id for checkpoint/version lineage.",
    )
    submitted_at: datetime = Field(
        ...,
        description="When the project was submitted.",
    )
    updated_at: datetime = Field(
        ...,
        description="When the project was last updated.",
    )


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project save."""

    title: str | None = Field(
        None,
        max_length=200,
        description="Updated display title of the project.",
    )
    metadata_: dict | None = Field(
        None,
        serialization_alias="metadata",
        description="Updated metadata payload.",
    )
    save_kind: str | None = Field(
        None,
        description="Save mode (autosave or checkpoint).",
    )


class PublicExploreProjectResponse(BaseModel):
    """Public game/project card shown on the Explore page."""

    id: UUID = Field(..., description="Unique project identifier.")
    title: str = Field(..., description="Public display title for the project.")
    creator_name: str = Field(..., description="Display name of the creator.")
    creator_avatar_url: str | None = Field(
        None,
        description="Optional creator avatar URL.",
    )
    icon_url: str | None = Field(
        None,
        description="Optional icon/thumbnail image for the game card.",
    )
    play_url: str | None = Field(
        None,
        description="Optional public URL where the game can be played.",
    )
    published_at: datetime = Field(
        ...,
        description="Timestamp used for ordering the public gallery.",
    )


# --- Lab Assignment schemas ---


class LabAssignmentCreate(BaseModel):
    """Assign a lab to a student or a classroom (mutually exclusive)."""

    lab_id: UUID = Field(..., description="ID of the lab to assign.")
    student_id: UUID | None = Field(None, description="Target student (for individual assignment).")
    classroom_id: UUID | None = Field(None, description="Target classroom (all enrolled students get access).")
    due_at: datetime | None = Field(None, description="Optional due date (ISO 8601).")
    notes: str | None = Field(None, max_length=2000, description="Assignment instructions or notes.")

    @model_validator(mode="after")
    def exactly_one_target(self) -> "LabAssignmentCreate":
        if bool(self.student_id) == bool(self.classroom_id):
            raise ValueError("Provide exactly one of student_id or classroom_id")
        return self


class LabAssignmentUpdate(BaseModel):
    """Update an existing lab assignment."""

    due_at: datetime | None = Field(None, description="Updated due date.")
    status: str | None = Field(None, description="Updated status: assigned, in_progress, submitted, graded.")
    notes: str | None = Field(None, max_length=2000, description="Updated notes.")


class LabAssignmentResponse(BaseModel):
    """Lab assignment response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Assignment UUID.")
    lab_id: UUID = Field(..., description="Assigned lab ID.")
    student_id: UUID | None = Field(None, description="Target student (null for classroom assignment).")
    classroom_id: UUID | None = Field(None, description="Target classroom (null for student assignment).")
    tenant_id: UUID = Field(..., description="Tenant UUID.")
    assigned_by: UUID = Field(..., description="User who created the assignment.")
    due_at: datetime | None = Field(None, description="Due date.")
    status: str = Field(..., description="Assignment status.")
    notes: str | None = Field(None, description="Assignment notes.")
    created_at: datetime = Field(..., description="When the assignment was created.")
    updated_at: datetime = Field(..., description="Last update timestamp.")


# --- Submission Feedback schemas ---


class FeedbackCreate(BaseModel):
    """Instructor feedback on a student submission."""

    feedback_text: str = Field(..., max_length=5000, description="Written feedback.")
    grade: str | None = Field(None, max_length=20, description="Grade (e.g. 'A', 'B+', '85/100', 'Pass').")
    rubric_scores: dict | None = Field(None, description="Optional structured rubric scores.")


class FeedbackUpdate(BaseModel):
    """Edit existing feedback."""

    feedback_text: str | None = Field(None, max_length=5000, description="Updated feedback text.")
    grade: str | None = Field(None, max_length=20, description="Updated grade.")
    rubric_scores: dict | None = Field(None, description="Updated rubric scores.")


class FeedbackResponse(BaseModel):
    """Feedback response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Feedback UUID.")
    project_id: UUID = Field(..., description="Project this feedback is for.")
    instructor_id: UUID = Field(..., description="Instructor who left the feedback.")
    tenant_id: UUID = Field(..., description="Tenant UUID.")
    feedback_text: str = Field(..., description="Written feedback.")
    grade: str | None = Field(None, description="Grade.")
    rubric_scores: dict | None = Field(None, description="Structured rubric scores.")
    created_at: datetime = Field(..., description="When the feedback was created.")
    updated_at: datetime = Field(..., description="Last update timestamp.")
