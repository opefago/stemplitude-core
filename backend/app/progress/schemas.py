"""Progress schemas for lesson and lab tracking."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LessonProgressUpdate(BaseModel):
    """Schema for updating lesson progress (partial update)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "completed",
                    "score": 95,
                    "time_spent_seconds": 1800,
                }
            ]
        }
    )

    status: str | None = Field(
        None,
        description="Progress status: 'not_started', 'in_progress', or 'completed'.",
    )
    score: int | None = Field(
        None,
        ge=0,
        le=100,
        description="Score achieved (0-100) when lesson is completed.",
    )
    time_spent_seconds: int | None = Field(
        None,
        ge=0,
        description="Total time spent on the lesson in seconds.",
    )


class LessonProgressResponse(BaseModel):
    """Lesson progress record returned from the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the progress record.")
    student_id: UUID = Field(..., description="ID of the student who made progress.")
    lesson_id: UUID = Field(..., description="ID of the lesson.")
    tenant_id: UUID = Field(..., description="ID of the tenant (organization).")
    status: str = Field(
        ...,
        description="Progress status: 'not_started', 'in_progress', or 'completed'.",
    )
    score: int | None = Field(
        None,
        description="Score achieved (0-100) when lesson is completed.",
    )
    time_spent_seconds: int = Field(
        0,
        description="Total time spent on the lesson in seconds.",
    )
    completed_at: datetime | None = Field(
        None,
        description="Timestamp when the lesson was marked completed.",
    )


class LabProgressUpdate(BaseModel):
    """Schema for updating lab progress (partial update)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "in_progress",
                    "score": 80,
                    "time_spent_seconds": 3600,
                    "state_snapshot": {"step": 3},
                }
            ]
        }
    )

    status: str | None = Field(
        None,
        description="Progress status: 'not_started', 'in_progress', or 'completed'.",
    )
    score: int | None = Field(
        None,
        ge=0,
        le=100,
        description="Score achieved (0-100) when lab is completed.",
    )
    time_spent_seconds: int | None = Field(
        None,
        ge=0,
        description="Total time spent on the lab in seconds.",
    )
    state_snapshot: dict | None = Field(
        None,
        description="JSON snapshot of lab state (e.g., current step, saved work).",
    )


class LabProgressResponse(BaseModel):
    """Lab progress record returned from the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the progress record.")
    student_id: UUID = Field(..., description="ID of the student who made progress.")
    lab_id: UUID = Field(..., description="ID of the lab.")
    tenant_id: UUID = Field(..., description="ID of the tenant (organization).")
    status: str = Field(
        ...,
        description="Progress status: 'not_started', 'in_progress', or 'completed'.",
    )
    score: int | None = Field(
        None,
        description="Score achieved (0-100) when lab is completed.",
    )
    time_spent_seconds: int = Field(
        0,
        description="Total time spent on the lab in seconds.",
    )
    state_snapshot: dict | None = Field(
        None,
        description="JSON snapshot of lab state (e.g., current step, saved work).",
    )
    completed_at: datetime | None = Field(
        None,
        description="Timestamp when the lab was marked completed.",
    )


class ProgressSummary(BaseModel):
    """Aggregated progress summary for a student or tenant."""

    total_lessons: int = Field(
        0,
        description="Total number of lessons available.",
    )
    completed_lessons: int = Field(
        0,
        description="Number of lessons completed.",
    )
    total_labs: int = Field(
        0,
        description="Total number of labs available.",
    )
    completed_labs: int = Field(
        0,
        description="Number of labs completed.",
    )
    average_score: float | None = Field(
        None,
        description="Average score across completed lessons and labs.",
    )
    total_time_spent_seconds: int = Field(
        0,
        description="Total time spent across all lessons and labs in seconds.",
    )
