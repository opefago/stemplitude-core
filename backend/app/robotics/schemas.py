"""Pydantic schemas for robotics phase-0 contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ProjectMode = Literal["blocks", "hybrid", "python", "cpp"]
EditorMode = Literal["code", "sim", "split"]
ProjectSource = Literal["manual", "curriculum_lab", "track_lesson_resource", "default"]
SimulationSupport = Literal["none", "partial", "full"]
DeploymentSupport = Literal["none", "export_only", "direct_flash"]
AttemptStatus = Literal["running", "completed", "failed", "cancelled"]
CompileLanguage = Literal["python", "cpp"]
CompileStatus = Literal["queued", "running", "completed", "failed"]


class RoboticsCapabilityManifest(BaseModel):
    vendor: str = Field(..., min_length=1, max_length=64)
    robot_type: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=128)
    languages: list[ProjectMode] = Field(default_factory=list)
    simulation_support: SimulationSupport = "partial"
    deployment_support: DeploymentSupport = "export_only"
    sensors: list[str] = Field(default_factory=list)
    actuators: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)


class RoboticsProjectSource(BaseModel):
    blocks_xml: str | None = None
    ir: dict[str, Any] = Field(default_factory=dict)
    text_code: str | None = None


class RoboticsProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    robot_vendor: str = Field(..., min_length=1, max_length=64)
    robot_type: str = Field(..., min_length=1, max_length=64)
    mode: ProjectMode = "blocks"
    editor_mode: EditorMode = "split"
    project_source: ProjectSource = "manual"
    schema_version: int = Field(default=1, ge=1)
    source: RoboticsProjectSource = Field(default_factory=RoboticsProjectSource)
    world_scene: dict[str, Any] = Field(default_factory=dict)
    runtime_settings: dict[str, Any] = Field(default_factory=dict)
    metadata_: dict[str, Any] = Field(default_factory=dict, alias="metadata")


class RoboticsProjectUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    mode: ProjectMode | None = None
    editor_mode: EditorMode | None = None
    project_source: ProjectSource | None = None
    schema_version: int | None = Field(None, ge=1)
    source: RoboticsProjectSource | None = None
    world_scene: dict[str, Any] | None = None
    runtime_settings: dict[str, Any] | None = None
    metadata_: dict[str, Any] | None = Field(None, alias="metadata")


class RoboticsProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    student_id: UUID
    title: str
    robot_vendor: str
    robot_type: str
    mode: ProjectMode
    editor_mode: EditorMode = "split"
    project_source: ProjectSource = "manual"
    schema_version: int
    source: RoboticsProjectSource
    world_scene: dict[str, Any] = Field(default_factory=dict)
    runtime_settings: dict[str, Any] = Field(default_factory=dict)
    metadata_: dict[str, Any] = Field(default_factory=dict, alias="metadata")
    revision: int = Field(default=1, ge=1)
    created_at: datetime
    updated_at: datetime


class RoboticsAttemptCreate(BaseModel):
    mission_id: str = Field(..., min_length=1, max_length=128)
    run_mode: Literal["simulate", "hardware_export"] = "simulate"
    seed: int | None = Field(None, ge=0)
    telemetry: dict[str, Any] = Field(default_factory=dict)


class RoboticsAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    tenant_id: UUID
    mission_id: str
    run_mode: Literal["simulate", "hardware_export"]
    status: AttemptStatus
    score: float | None = None
    telemetry: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    completed_at: datetime | None = None


class RoboticsEventRecord(BaseModel):
    event_name: str = Field(..., min_length=3, max_length=128)
    occurred_at: datetime
    project_id: UUID | None = None
    attempt_id: UUID | None = None
    actor_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RoboticsEventsIngestRequest(BaseModel):
    events: list[RoboticsEventRecord] = Field(default_factory=list)


class RoboticsEventsIngestResponse(BaseModel):
    accepted_count: int = Field(default=0, ge=0)


class RoboticsTemplateResolveResponse(BaseModel):
    source: Literal["curriculum_lab", "track_lesson_resource", "default"]
    source_id: UUID | None = None
    title: str
    robot_vendor: str
    robot_type: str
    mode: ProjectMode = "blocks"
    source_payload: RoboticsProjectSource = Field(default_factory=RoboticsProjectSource)
    world_scene: dict[str, Any] = Field(default_factory=dict)
    runtime_settings: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoboticsCompileRequest(BaseModel):
    robot_vendor: str = Field(..., min_length=1, max_length=64)
    robot_type: str = Field(..., min_length=1, max_length=64)
    language: CompileLanguage = "python"
    source_code: str = Field(..., min_length=1)
    target: str = Field(default="vex_v5", min_length=1, max_length=64)


class RoboticsCompileJobResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    requested_by: UUID
    robot_vendor: str
    robot_type: str
    language: CompileLanguage
    target: str
    status: CompileStatus = "queued"
    provider: str = "local_export"
    artifact_name: str | None = None
    artifact_content_type: str | None = None
    artifact_content_base64: str | None = None
    diagnostics: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


WorldVisibility = Literal["private", "tenant", "public"]
WorldDifficulty = Literal["beginner", "intermediate", "advanced"]


class RoboticsWorldCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    world_scene: dict[str, Any] = Field(default_factory=dict)
    runtime_settings: dict[str, Any] = Field(default_factory=dict)
    mission: dict[str, Any] | None = None
    visibility: WorldVisibility = "private"
    difficulty: WorldDifficulty | None = None
    tags: list[str] = Field(default_factory=list)
    width_cells: int = Field(default=40, ge=5, le=200)
    height_cells: int = Field(default=24, ge=5, le=200)


class RoboticsWorldUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    world_scene: dict[str, Any] | None = None
    runtime_settings: dict[str, Any] | None = None
    mission: dict[str, Any] | None = None
    visibility: WorldVisibility | None = None
    difficulty: WorldDifficulty | None = None
    tags: list[str] | None = None
    width_cells: int | None = Field(None, ge=5, le=200)
    height_cells: int | None = Field(None, ge=5, le=200)


class RoboticsWorldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    creator_id: UUID
    title: str
    description: str | None = None
    world_scene: dict[str, Any] = Field(default_factory=dict)
    runtime_settings: dict[str, Any] = Field(default_factory=dict)
    mission: dict[str, Any] | None = None
    is_template: bool = False
    share_code: str | None = None
    visibility: WorldVisibility = "private"
    difficulty: WorldDifficulty | None = None
    tags: list[str] = Field(default_factory=list)
    width_cells: int = 40
    height_cells: int = 24
    object_count: int = 0
    play_count: int = 0
    created_at: datetime
    updated_at: datetime


class RoboticsWorldGalleryItem(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    difficulty: WorldDifficulty | None = None
    tags: list[str] = Field(default_factory=list)
    width_cells: int = 40
    height_cells: int = 24
    object_count: int = 0
    play_count: int = 0
    creator_name: str | None = None
    share_code: str | None = None
    created_at: datetime


class RoboticsLeaderboardEntry(BaseModel):
    attempt_id: UUID
    student_id: UUID
    student_name: str | None = None
    score: float
    time_ms: int | None = None
    path_length_cm: float | None = None
    checkpoints_hit: int | None = None
    created_at: datetime

