"""SQLAlchemy models for robotics projects and shared worlds."""

from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _generate_share_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class RoboticsProject(Base):
    """Persistent student robotics project."""

    __tablename__ = "robotics_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="Untitled Project")
    robot_vendor: Mapped[str] = mapped_column(String(64), nullable=False, default="vex")
    robot_type: Mapped[str] = mapped_column(String(64), nullable=False, default="vex_vr")
    mode: Mapped[str] = mapped_column(String(24), nullable=False, default="blocks")
    editor_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="split")
    project_source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    world_scene: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    runtime_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_robotics_projects_tenant_student", "tenant_id", "student_id"),
    )


class RoboticsWorld(Base):
    """Saved/shared robotics world environment."""

    __tablename__ = "robotics_worlds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    creator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    world_scene: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    runtime_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mission: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    share_code: Mapped[str | None] = mapped_column(
        String(16), unique=True, nullable=True, default=_generate_share_code
    )
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="private")
    difficulty: Mapped[str | None] = mapped_column(String(24), nullable=True)
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    width_cells: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    height_cells: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    object_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    play_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_robotics_worlds_share_code", "share_code", unique=True),
        Index("ix_robotics_worlds_visibility", "visibility", "tenant_id"),
    )


class RoboticsAttempt(Base):
    """Recorded simulation attempt for scoring and replay."""

    __tablename__ = "robotics_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("robotics_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    world_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    mission_id: Mapped[str] = mapped_column(String(128), nullable=False)
    run_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="simulate")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="running")
    score: Mapped[float | None] = mapped_column(nullable=True)
    time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    path_length_cm: Mapped[float | None] = mapped_column(nullable=True)
    checkpoints_hit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telemetry: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    replay_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
