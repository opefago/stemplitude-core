"""Curriculum schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CourseBase(BaseModel):
    """Base course schema."""

    program_id: UUID | None = Field(
        None,
        description="Optional parent program ID. Null means standalone curriculum.",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display title of the course.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Optional description of the course content and learning outcomes.",
    )
    difficulty: str | None = Field(
        None,
        max_length=20,
        description="Difficulty level: 'beginner', 'intermediate', or 'advanced'.",
    )
    sort_order: int = Field(
        0,
        description="Order in which the course appears in the curriculum.",
    )
    is_published: bool = Field(
        False,
        description="Whether the course is published and visible to students.",
    )
    default_permitted_labs: list[str] | None = Field(
        None,
        description=(
            "Optional lab launcher display names (same strings as classroom permitted_labs) "
            "used to prefill new classes when this curriculum is selected."
        ),
    )

    @field_validator("default_permitted_labs", mode="before")
    @classmethod
    def normalize_default_permitted_labs(cls, v):
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("default_permitted_labs must be a list of strings")
        out: list[str] = []
        for item in v:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s:
                continue
            out.append(s[:80])
            if len(out) >= 32:
                break
        return out or None


class CourseCreate(CourseBase):
    """Schema for creating a course."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Introduction to Robotics",
                    "description": "Learn the basics of robotics and programming",
                    "difficulty": "beginner",
                    "sort_order": 1,
                    "is_published": False,
                }
            ]
        }
    )


class CourseUpdate(BaseModel):
    """Schema for updating a course."""

    program_id: UUID | None = Field(
        None,
        description="Updated optional parent program ID.",
    )
    title: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated title of the course.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Updated description.",
    )
    difficulty: str | None = Field(
        None,
        max_length=20,
        description="Updated difficulty level.",
    )
    sort_order: int | None = Field(
        None,
        description="Updated sort order.",
    )
    is_published: bool | None = Field(
        None,
        description="Updated published status.",
    )
    default_permitted_labs: list[str] | None = Field(
        None,
        description="Updated default lab launcher labels for new classes (send [] to clear).",
    )

    @field_validator("default_permitted_labs", mode="before")
    @classmethod
    def normalize_default_permitted_labs_update(cls, v):
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("default_permitted_labs must be a list of strings")
        out: list[str] = []
        for item in v:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if not s:
                continue
            out.append(s[:80])
            if len(out) >= 32:
                break
        return out

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Introduction to Robotics",
                    "difficulty": "beginner",
                    "sort_order": 1,
                    "is_published": True,
                }
            ]
        }
    )


class CourseResponse(CourseBase):
    """Course response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the course.")
    tenant_id: UUID | None = Field(
        None,
        description="Tenant that owns the course.",
    )


class ModuleBase(BaseModel):
    """Base module schema."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display title of the module.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Optional description of the module content.",
    )
    sort_order: int = Field(
        0,
        description="Order in which the module appears within the course.",
    )


class ModuleCreate(ModuleBase):
    """Schema for creating a module."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Getting Started with Sensors",
                    "description": "Learn to use ultrasonic, IR, and other sensors",
                    "sort_order": 1,
                }
            ]
        }
    )


class ModuleUpdate(BaseModel):
    """Schema for updating a module."""

    title: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated title of the module.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Updated description.",
    )
    sort_order: int | None = Field(
        None,
        description="Updated sort order.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Getting Started with Sensors",
                    "sort_order": 1,
                }
            ]
        }
    )


class ModuleResponse(ModuleBase):
    """Module response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the module.")
    course_id: UUID = Field(..., description="ID of the parent course.")


class LessonBase(BaseModel):
    """Base lesson schema."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display title of the lesson.",
    )
    content_type: str | None = Field(
        None,
        max_length=50,
        description="Type of content: 'interactive', 'video', 'text', 'quiz', etc.",
    )
    content: str | None = Field(
        None,
        description="Lesson content (HTML, markdown, or structured data).",
    )
    sort_order: int = Field(
        0,
        description="Order in which the lesson appears within the module.",
    )
    duration_minutes: int | None = Field(
        None,
        ge=1,
        description="Estimated duration of the lesson in minutes.",
    )


class LessonCreate(LessonBase):
    """Schema for creating a lesson."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Ultrasonic Distance Sensor",
                    "content_type": "interactive",
                    "content": None,
                    "sort_order": 1,
                    "duration_minutes": 45,
                }
            ]
        }
    )


class LessonUpdate(BaseModel):
    """Schema for updating a lesson."""

    title: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated title of the lesson.",
    )
    content_type: str | None = Field(
        None,
        max_length=50,
        description="Updated content type.",
    )
    content: str | None = Field(
        None,
        description="Updated lesson content.",
    )
    sort_order: int | None = Field(
        None,
        description="Updated sort order.",
    )
    duration_minutes: int | None = Field(
        None,
        ge=1,
        description="Updated duration in minutes.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Ultrasonic Distance Sensor",
                    "content_type": "interactive",
                    "duration_minutes": 45,
                }
            ]
        }
    )


class LessonResponse(LessonBase):
    """Lesson response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the lesson.")
    module_id: UUID = Field(..., description="ID of the parent module.")


class LabBase(BaseModel):
    """Base lab schema."""

    lab_type: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Type of lab: 'robotics_lab', 'electronics_lab', 'blockly_lab', etc.",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display title of the lab.",
    )
    config: dict | None = Field(
        None,
        description="Lab-specific configuration (JSON object).",
    )
    starter_code: dict | None = Field(
        None,
        description="Starter code or template for the lab.",
    )


class LabCreate(LabBase):
    """Schema for creating a lab."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "lab_type": "robotics_lab",
                    "title": "Build a Line Follower",
                    "config": {"grid_size": 8, "obstacles": True},
                    "starter_code": None,
                }
            ]
        }
    )


class LabUpdate(BaseModel):
    """Schema for updating a lab."""

    lab_type: str | None = Field(
        None,
        min_length=1,
        max_length=50,
        description="Updated lab type.",
    )
    title: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated title.",
    )
    config: dict | None = Field(
        None,
        description="Updated lab configuration.",
    )
    starter_code: dict | None = Field(
        None,
        description="Updated starter code.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "lab_type": "robotics_lab",
                    "title": "Build a Line Follower",
                    "config": {"grid_size": 8},
                }
            ]
        }
    )


class LabResponse(LabBase):
    """Lab response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the lab.")
    lesson_id: UUID | None = Field(
        None,
        description="ID of the parent lesson, if linked.",
    )


class CurriculumBulkAssignProgramRequest(BaseModel):
    """Bulk assign standalone curricula to a program."""

    course_ids: list[UUID] = Field(default_factory=list, description="Curriculum/course IDs to link.")
    program_id: UUID | None = Field(None, description="Program ID to link; null unlinks from program.")


class CurriculumBulkAssignProgramResponse(BaseModel):
    """Bulk assignment summary."""

    updated_count: int = Field(..., description="Number of curricula updated.")


# --- Rubric & assignment templates (classroom assignment authoring) ---


class RubricCriterionDefinition(BaseModel):
    """Single rubric row stored on a template (max points only; no score yet)."""

    criterion_id: str = Field(..., min_length=1, max_length=80)
    label: str | None = Field(None, max_length=200)
    max_points: int = Field(..., ge=1, le=1000)
    description: str | None = Field(None, max_length=500)

    model_config = ConfigDict(extra="forbid")


class RubricTemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)
    criteria: list[RubricCriterionDefinition] = Field(default_factory=list)


class RubricTemplateUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)
    criteria: list[RubricCriterionDefinition] | None = None


class RubricTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    title: str
    description: str | None
    criteria: list
    created_at: datetime
    updated_at: datetime


class AssignmentTemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    instructions: str | None = None
    course_id: UUID | None = Field(None, description="Optional course scope.")
    lesson_id: UUID | None = Field(None, description="Optional lesson scope (must belong to course if both set).")
    lab_id: UUID | None = Field(None, description="Optional designated curriculum lab for this template.")
    rubric_template_id: UUID | None = None
    use_rubric: bool = True
    requires_lab: bool = False
    requires_assets: bool = False
    allow_edit_after_submit: bool = False
    sort_order: int = 0


class AssignmentTemplateUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    instructions: str | None = None
    course_id: UUID | None = None
    lesson_id: UUID | None = None
    lab_id: UUID | None = None
    rubric_template_id: UUID | None = None
    use_rubric: bool | None = None
    requires_lab: bool | None = None
    requires_assets: bool | None = None
    allow_edit_after_submit: bool | None = None
    sort_order: int | None = None


class AssignmentTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    course_id: UUID | None
    lesson_id: UUID | None
    title: str
    instructions: str | None
    lab_id: UUID | None
    rubric_template_id: UUID | None
    use_rubric: bool
    requires_lab: bool
    requires_assets: bool
    allow_edit_after_submit: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
