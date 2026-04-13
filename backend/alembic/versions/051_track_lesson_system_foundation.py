"""Track + lesson multi-tenant foundation.

Revision ID: 051_track_lesson_sys
Revises: 050_project_revision_fields
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "051_track_lesson_sys"
down_revision: Union[str, None] = "050_project_revision_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tracks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("owner_type", sa.String(length=20), nullable=False, server_default="tenant"),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default="tenant_only"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=1000), nullable=True),
        sa.Column("subject", sa.String(length=100), nullable=True),
        sa.Column("grade", sa.String(length=40), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tracks_tenant_id"), "tracks", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_tracks_visibility"), "tracks", ["visibility"], unique=False)
    op.create_index(op.f("ix_tracks_status"), "tracks", ["status"], unique=False)
    op.create_index(op.f("ix_tracks_subject"), "tracks", ["subject"], unique=False)
    op.create_index(op.f("ix_tracks_grade"), "tracks", ["grade"], unique=False)
    op.create_index("ix_tracks_owner_visibility_status", "tracks", ["tenant_id", "owner_type", "visibility", "status"])

    op.create_table(
        "content_lessons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("owner_type", sa.String(length=20), nullable=False, server_default="tenant"),
        sa.Column("visibility", sa.String(length=32), nullable=False, server_default="tenant_only"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=1000), nullable=True),
        sa.Column("objectives", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("subject", sa.String(length=100), nullable=True),
        sa.Column("grade", sa.String(length=40), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_content_lessons_tenant_id"), "content_lessons", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_content_lessons_visibility"), "content_lessons", ["visibility"], unique=False)
    op.create_index(op.f("ix_content_lessons_status"), "content_lessons", ["status"], unique=False)
    op.create_index(op.f("ix_content_lessons_subject"), "content_lessons", ["subject"], unique=False)
    op.create_index(op.f("ix_content_lessons_grade"), "content_lessons", ["grade"], unique=False)
    op.create_index("ix_content_lessons_owner_visibility_status", "content_lessons", ["tenant_id", "owner_type", "visibility", "status"])

    op.create_table(
        "track_lessons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("track_id", "lesson_id", name="uq_track_lesson"),
    )
    op.create_index(op.f("ix_track_lessons_track_id"), "track_lessons", ["track_id"], unique=False)
    op.create_index(op.f("ix_track_lessons_lesson_id"), "track_lessons", ["lesson_id"], unique=False)
    op.create_index("ix_track_lessons_track_order", "track_lessons", ["track_id", "order_index"], unique=False)

    op.create_table(
        "lesson_resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("url", sa.String(length=1024), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lesson_resources_lesson_id"), "lesson_resources", ["lesson_id"], unique=False)

    op.create_table(
        "video_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="youtube"),
        sa.Column("provider_ref", sa.String(length=512), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=1024), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id"),
    )
    op.create_index(op.f("ix_video_assets_provider"), "video_assets", ["provider"], unique=False)
    op.create_index(op.f("ix_video_assets_provider_ref"), "video_assets", ["provider_ref"], unique=False)
    op.create_index(op.f("ix_video_assets_tenant_id"), "video_assets", ["tenant_id"], unique=False)

    op.create_table(
        "transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("video_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="en"),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_asset_id"], ["video_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcripts_lesson_id"), "transcripts", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_transcripts_video_asset_id"), "transcripts", ["video_asset_id"], unique=False)

    op.create_table(
        "transcript_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transcript_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("start_second", sa.Integer(), nullable=True),
        sa.Column("end_second", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcript_chunks_transcript_id"), "transcript_chunks", ["transcript_id"], unique=False)

    op.create_table(
        "classroom_track_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("auto_suggestion_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("allow_override", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("milestone_tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("assigned_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_classroom_track_assignments_tenant_id"), "classroom_track_assignments", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_assignments_classroom_id"), "classroom_track_assignments", ["classroom_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_assignments_track_id"), "classroom_track_assignments", ["track_id"], unique=False)

    op.create_table(
        "classroom_track_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("current_order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignment_id"], ["classroom_track_assignments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_classroom_track_instances_tenant_id"), "classroom_track_instances", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instances_classroom_id"), "classroom_track_instances", ["classroom_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instances_track_id"), "classroom_track_instances", ["track_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instances_assignment_id"), "classroom_track_instances", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instances_status"), "classroom_track_instances", ["status"], unique=False)
    op.create_index("ix_classroom_track_instances_classroom_status", "classroom_track_instances", ["classroom_id", "status"], unique=False)

    op.create_table(
        "classroom_track_instance_lessons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("is_inserted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completion_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["track_instance_id"], ["classroom_track_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("track_instance_id", "lesson_id", name="uq_track_instance_lesson"),
    )
    op.create_index(op.f("ix_classroom_track_instance_lessons_track_instance_id"), "classroom_track_instance_lessons", ["track_instance_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instance_lessons_lesson_id"), "classroom_track_instance_lessons", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_classroom_track_instance_lessons_status"), "classroom_track_instance_lessons", ["status"], unique=False)

    op.create_table(
        "curriculum_track_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("curriculum_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["curriculum_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("curriculum_id", "track_id", name="uq_curriculum_track"),
    )
    op.create_index(op.f("ix_curriculum_track_assignments_tenant_id"), "curriculum_track_assignments", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_curriculum_track_assignments_curriculum_id"), "curriculum_track_assignments", ["curriculum_id"], unique=False)
    op.create_index(op.f("ix_curriculum_track_assignments_track_id"), "curriculum_track_assignments", ["track_id"], unique=False)

    op.create_table(
        "session_lesson_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("classroom_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("selection_type", sa.String(length=20), nullable=False, server_default="suggested"),
        sa.Column("coverage_status", sa.String(length=20), nullable=False, server_default="completed"),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("covered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["classroom_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_instance_id"], ["classroom_track_instances.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resource_id"], ["lesson_resources.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_lesson_links_tenant_id"), "session_lesson_links", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_session_id"), "session_lesson_links", ["session_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_classroom_id"), "session_lesson_links", ["classroom_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_track_instance_id"), "session_lesson_links", ["track_instance_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_lesson_id"), "session_lesson_links", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_resource_id"), "session_lesson_links", ["resource_id"], unique=False)
    op.create_index(op.f("ix_session_lesson_links_covered_at"), "session_lesson_links", ["covered_at"], unique=False)
    op.create_index("ix_session_lesson_links_session_covered_at", "session_lesson_links", ["session_id", "covered_at"], unique=False)

    op.create_table(
        "track_lesson_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("completion_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_instance_id"], ["classroom_track_instances.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "lesson_id", "track_instance_id", name="uq_track_lesson_progress"),
    )
    op.create_index(op.f("ix_track_lesson_progress_tenant_id"), "track_lesson_progress", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_track_lesson_progress_student_id"), "track_lesson_progress", ["student_id"], unique=False)
    op.create_index(op.f("ix_track_lesson_progress_lesson_id"), "track_lesson_progress", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_track_lesson_progress_track_instance_id"), "track_lesson_progress", ["track_instance_id"], unique=False)

    op.create_table(
        "track_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("completed_lessons", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_lessons", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_lessons", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_instance_id"], ["classroom_track_instances.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "track_instance_id", name="uq_track_progress_student_instance"),
    )
    op.create_index(op.f("ix_track_progress_tenant_id"), "track_progress", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_track_progress_student_id"), "track_progress", ["student_id"], unique=False)
    op.create_index(op.f("ix_track_progress_track_id"), "track_progress", ["track_id"], unique=False)
    op.create_index(op.f("ix_track_progress_track_instance_id"), "track_progress", ["track_instance_id"], unique=False)

    op.create_table(
        "milestones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_milestones_track_id"), "milestones", ["track_id"], unique=False)

    op.create_table(
        "milestone_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("milestone_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_type", sa.String(length=32), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=True),
        sa.Column("lesson_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["milestone_id"], ["milestones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["content_lessons.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_milestone_rules_milestone_id"), "milestone_rules", ["milestone_id"], unique=False)
    op.create_index(op.f("ix_milestone_rules_lesson_id"), "milestone_rules", ["lesson_id"], unique=False)

    op.create_table(
        "content_permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_type", sa.String(length=20), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "content_type",
            "content_id",
            "subject_type",
            "subject_id",
            "permission",
            name="uq_content_permission_tuple",
        ),
    )
    op.create_index(op.f("ix_content_permissions_tenant_id"), "content_permissions", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_content_permissions_content_id"), "content_permissions", ["content_id"], unique=False)
    op.create_index(op.f("ix_content_permissions_subject_id"), "content_permissions", ["subject_id"], unique=False)

    op.create_table(
        "media_uploads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="r2"),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_media_uploads_tenant_id"), "media_uploads", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_media_uploads_created_by_id"), "media_uploads", ["created_by_id"], unique=False)

    op.create_table(
        "media_playback_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("video_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_type", sa.String(length=20), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_asset_id"], ["video_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_media_playback_sessions_tenant_id"), "media_playback_sessions", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_media_playback_sessions_video_asset_id"), "media_playback_sessions", ["video_asset_id"], unique=False)
    op.create_index(op.f("ix_media_playback_sessions_actor_id"), "media_playback_sessions", ["actor_id"], unique=False)

    op.create_table(
        "content_duplicates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_content_type", sa.String(length=20), nullable=False),
        sa.Column("source_content_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_content_type", sa.String(length=20), nullable=False),
        sa.Column("target_content_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("copied_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["source_tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_content_duplicates_source_content_id"), "content_duplicates", ["source_content_id"], unique=False)
    op.create_index(op.f("ix_content_duplicates_source_tenant_id"), "content_duplicates", ["source_tenant_id"], unique=False)
    op.create_index(op.f("ix_content_duplicates_target_content_id"), "content_duplicates", ["target_content_id"], unique=False)
    op.create_index(op.f("ix_content_duplicates_target_tenant_id"), "content_duplicates", ["target_tenant_id"], unique=False)
    op.create_index(op.f("ix_content_duplicates_copied_by_id"), "content_duplicates", ["copied_by_id"], unique=False)

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_content_lessons_search
        ON content_lessons USING GIN (
            to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(tags::text, ''))
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_transcript_chunks_search
        ON transcript_chunks USING GIN (to_tsvector('english', coalesce(content, '')))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_search")
    op.execute("DROP INDEX IF EXISTS ix_content_lessons_search")

    op.drop_index(op.f("ix_content_duplicates_copied_by_id"), table_name="content_duplicates")
    op.drop_index(op.f("ix_content_duplicates_target_tenant_id"), table_name="content_duplicates")
    op.drop_index(op.f("ix_content_duplicates_target_content_id"), table_name="content_duplicates")
    op.drop_index(op.f("ix_content_duplicates_source_tenant_id"), table_name="content_duplicates")
    op.drop_index(op.f("ix_content_duplicates_source_content_id"), table_name="content_duplicates")
    op.drop_table("content_duplicates")

    op.drop_index(op.f("ix_media_playback_sessions_actor_id"), table_name="media_playback_sessions")
    op.drop_index(op.f("ix_media_playback_sessions_video_asset_id"), table_name="media_playback_sessions")
    op.drop_index(op.f("ix_media_playback_sessions_tenant_id"), table_name="media_playback_sessions")
    op.drop_table("media_playback_sessions")

    op.drop_index(op.f("ix_media_uploads_created_by_id"), table_name="media_uploads")
    op.drop_index(op.f("ix_media_uploads_tenant_id"), table_name="media_uploads")
    op.drop_table("media_uploads")

    op.drop_index(op.f("ix_content_permissions_subject_id"), table_name="content_permissions")
    op.drop_index(op.f("ix_content_permissions_content_id"), table_name="content_permissions")
    op.drop_index(op.f("ix_content_permissions_tenant_id"), table_name="content_permissions")
    op.drop_table("content_permissions")

    op.drop_index(op.f("ix_milestone_rules_lesson_id"), table_name="milestone_rules")
    op.drop_index(op.f("ix_milestone_rules_milestone_id"), table_name="milestone_rules")
    op.drop_table("milestone_rules")

    op.drop_index(op.f("ix_milestones_track_id"), table_name="milestones")
    op.drop_table("milestones")

    op.drop_index(op.f("ix_track_progress_track_instance_id"), table_name="track_progress")
    op.drop_index(op.f("ix_track_progress_track_id"), table_name="track_progress")
    op.drop_index(op.f("ix_track_progress_student_id"), table_name="track_progress")
    op.drop_index(op.f("ix_track_progress_tenant_id"), table_name="track_progress")
    op.drop_table("track_progress")

    op.drop_index(op.f("ix_track_lesson_progress_track_instance_id"), table_name="track_lesson_progress")
    op.drop_index(op.f("ix_track_lesson_progress_lesson_id"), table_name="track_lesson_progress")
    op.drop_index(op.f("ix_track_lesson_progress_student_id"), table_name="track_lesson_progress")
    op.drop_index(op.f("ix_track_lesson_progress_tenant_id"), table_name="track_lesson_progress")
    op.drop_table("track_lesson_progress")

    op.drop_index("ix_session_lesson_links_session_covered_at", table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_covered_at"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_resource_id"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_lesson_id"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_track_instance_id"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_classroom_id"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_session_id"), table_name="session_lesson_links")
    op.drop_index(op.f("ix_session_lesson_links_tenant_id"), table_name="session_lesson_links")
    op.drop_table("session_lesson_links")

    op.drop_index(op.f("ix_curriculum_track_assignments_track_id"), table_name="curriculum_track_assignments")
    op.drop_index(op.f("ix_curriculum_track_assignments_curriculum_id"), table_name="curriculum_track_assignments")
    op.drop_index(op.f("ix_curriculum_track_assignments_tenant_id"), table_name="curriculum_track_assignments")
    op.drop_table("curriculum_track_assignments")

    op.drop_index(op.f("ix_classroom_track_instance_lessons_status"), table_name="classroom_track_instance_lessons")
    op.drop_index(op.f("ix_classroom_track_instance_lessons_lesson_id"), table_name="classroom_track_instance_lessons")
    op.drop_index(op.f("ix_classroom_track_instance_lessons_track_instance_id"), table_name="classroom_track_instance_lessons")
    op.drop_table("classroom_track_instance_lessons")

    op.drop_index("ix_classroom_track_instances_classroom_status", table_name="classroom_track_instances")
    op.drop_index(op.f("ix_classroom_track_instances_status"), table_name="classroom_track_instances")
    op.drop_index(op.f("ix_classroom_track_instances_assignment_id"), table_name="classroom_track_instances")
    op.drop_index(op.f("ix_classroom_track_instances_track_id"), table_name="classroom_track_instances")
    op.drop_index(op.f("ix_classroom_track_instances_classroom_id"), table_name="classroom_track_instances")
    op.drop_index(op.f("ix_classroom_track_instances_tenant_id"), table_name="classroom_track_instances")
    op.drop_table("classroom_track_instances")

    op.drop_index(op.f("ix_classroom_track_assignments_track_id"), table_name="classroom_track_assignments")
    op.drop_index(op.f("ix_classroom_track_assignments_classroom_id"), table_name="classroom_track_assignments")
    op.drop_index(op.f("ix_classroom_track_assignments_tenant_id"), table_name="classroom_track_assignments")
    op.drop_table("classroom_track_assignments")

    op.drop_index(op.f("ix_transcript_chunks_transcript_id"), table_name="transcript_chunks")
    op.drop_table("transcript_chunks")

    op.drop_index(op.f("ix_transcripts_video_asset_id"), table_name="transcripts")
    op.drop_index(op.f("ix_transcripts_lesson_id"), table_name="transcripts")
    op.drop_table("transcripts")

    op.drop_index(op.f("ix_video_assets_tenant_id"), table_name="video_assets")
    op.drop_index(op.f("ix_video_assets_provider_ref"), table_name="video_assets")
    op.drop_index(op.f("ix_video_assets_provider"), table_name="video_assets")
    op.drop_table("video_assets")

    op.drop_index(op.f("ix_lesson_resources_lesson_id"), table_name="lesson_resources")
    op.drop_table("lesson_resources")

    op.drop_index("ix_track_lessons_track_order", table_name="track_lessons")
    op.drop_index(op.f("ix_track_lessons_lesson_id"), table_name="track_lessons")
    op.drop_index(op.f("ix_track_lessons_track_id"), table_name="track_lessons")
    op.drop_table("track_lessons")

    op.drop_index("ix_content_lessons_owner_visibility_status", table_name="content_lessons")
    op.drop_index(op.f("ix_content_lessons_grade"), table_name="content_lessons")
    op.drop_index(op.f("ix_content_lessons_subject"), table_name="content_lessons")
    op.drop_index(op.f("ix_content_lessons_status"), table_name="content_lessons")
    op.drop_index(op.f("ix_content_lessons_visibility"), table_name="content_lessons")
    op.drop_index(op.f("ix_content_lessons_tenant_id"), table_name="content_lessons")
    op.drop_table("content_lessons")

    op.drop_index("ix_tracks_owner_visibility_status", table_name="tracks")
    op.drop_index(op.f("ix_tracks_grade"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_subject"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_status"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_visibility"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_tenant_id"), table_name="tracks")
    op.drop_table("tracks")
