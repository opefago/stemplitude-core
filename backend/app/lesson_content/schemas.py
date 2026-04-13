from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LessonResourceCreate(BaseModel):
    resource_type: str
    title: str = Field(..., min_length=1, max_length=200)
    body: str | None = None
    url: str | None = None
    metadata: dict = Field(default_factory=dict)


class VideoAssetInput(BaseModel):
    provider: str = Field(..., pattern="^(youtube|r2)$")
    provider_ref: str = Field(..., min_length=1, max_length=512)
    title: str | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None


class LessonBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=1000)
    objectives: list[str] = Field(default_factory=list)
    subject: str | None = None
    grade: str | None = None
    tags: list[str] = Field(default_factory=list)
    duration_minutes: int | None = None
    visibility: str = Field(default="tenant_only")
    status: str = Field(default="draft")
    video: VideoAssetInput | None = None
    resources: list[LessonResourceCreate] = Field(default_factory=list)
    transcript: str | None = None
    quiz_ids: list[UUID] = Field(default_factory=list)


class LessonCreate(LessonBase):
    owner_type: str = Field(default="tenant")


class LessonUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    objectives: list[str] | None = None
    subject: str | None = None
    grade: str | None = None
    tags: list[str] | None = None
    duration_minutes: int | None = None
    visibility: str | None = None
    status: str | None = None
    video: VideoAssetInput | None = None
    transcript: str | None = None
    quiz_ids: list[UUID] | None = None


class LessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None
    owner_type: str
    visibility: str
    status: str
    title: str
    summary: str | None
    objectives: list[str] = Field(default_factory=list)
    subject: str | None
    grade: str | None
    tags: list[str] = Field(default_factory=list)
    duration_minutes: int | None
    created_by_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class TrackLessonInput(BaseModel):
    lesson_id: UUID
    order_index: int = Field(ge=0)


class MilestoneRuleInput(BaseModel):
    rule_type: str
    threshold: int | None = None
    lesson_id: UUID | None = None
    config: dict = Field(default_factory=dict)


class MilestoneInput(BaseModel):
    title: str
    description: str | None = None
    order_index: int = Field(ge=0, default=0)
    rules: list[MilestoneRuleInput] = Field(default_factory=list)


class TrackBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=1000)
    subject: str | None = None
    grade: str | None = None
    tags: list[str] = Field(default_factory=list)
    visibility: str = Field(default="tenant_only")
    status: str = Field(default="draft")
    lessons: list[TrackLessonInput] = Field(default_factory=list)
    milestones: list[MilestoneInput] = Field(default_factory=list)


class TrackCreate(TrackBase):
    owner_type: str = Field(default="tenant")


class TrackUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    subject: str | None = None
    grade: str | None = None
    tags: list[str] | None = None
    visibility: str | None = None
    status: str | None = None
    lessons: list[TrackLessonInput] | None = None
    milestones: list[MilestoneInput] | None = None


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None
    owner_type: str
    visibility: str
    status: str
    title: str
    summary: str | None
    subject: str | None
    grade: str | None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TrackAssignmentCreate(BaseModel):
    track_id: UUID
    auto_suggestion_enabled: bool = True
    allow_override: bool = True
    milestone_tracking_enabled: bool = True


class CurriculumTrackAssignmentCreate(BaseModel):
    track_id: UUID


class ClassroomLessonAssignmentCreate(BaseModel):
    lesson_id: UUID


class QuizBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = None
    visibility: str = Field(default="tenant_only")
    status: str = Field(default="draft")
    schema_definition: dict = Field(default_factory=dict, alias="schema_json")


class QuizCreate(QuizBase):
    owner_type: str = Field(default="tenant")


class QuizUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = None
    visibility: str | None = None
    status: str | None = None
    schema_definition: dict | None = Field(default=None, alias="schema_json")


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID | None
    owner_type: str
    visibility: str
    status: str
    title: str
    description: str | None
    instructions: str | None
    schema_definition: dict = Field(default_factory=dict, alias="schema_json")
    created_at: datetime
    updated_at: datetime


class QuizVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    quiz_id: UUID
    version: int
    title: str
    description: str | None
    instructions: str | None
    status: str
    schema_definition: dict = Field(default_factory=dict, alias="schema_json")
    created_at: datetime


class SessionCoverageCreate(BaseModel):
    track_instance_id: UUID | None = None
    lesson_id: UUID | None = None
    resource_id: UUID | None = None
    selection_type: str = "suggested"
    coverage_status: str = "completed"
    notes: str | None = None


class TrackProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    student_id: UUID
    track_id: UUID
    track_instance_id: UUID
    completed_lessons: int
    skipped_lessons: int
    total_lessons: int
    completion_percent: int
    updated_at: datetime


class SuggestedLessonResponse(BaseModel):
    lesson_id: UUID | None
    title: str | None
    order_index: int | None
    reason: str


class DuplicateContentRequest(BaseModel):
    content_type: str = Field(..., pattern="^(lesson|track)$")
    content_id: UUID


class SearchContentResponse(BaseModel):
    content_type: str
    content_id: UUID
    title: str
    summary: str | None = None
    owner_type: str
    visibility: str
