"""Add lab_assignments, submission_feedback tables; project.status column;
student_memberships.ui_mode_override column.

Revision ID: 002_lab_assignments
Revises: 001_initial
Create Date: 2026-03-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "002_lab_assignments"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- student_memberships.ui_mode_override ---
    op.add_column(
        "student_memberships",
        sa.Column("ui_mode_override", sa.String(20), nullable=True),
    )

    # --- projects.status ---
    op.add_column(
        "projects",
        sa.Column("status", sa.String(20), server_default="submitted", nullable=False),
    )

    # --- lab_assignments table ---
    op.create_table(
        "lab_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("lab_id", UUID(as_uuid=True), sa.ForeignKey("labs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True),
        sa.Column("classroom_id", UUID(as_uuid=True), sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="assigned", nullable=False),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(student_id IS NOT NULL AND classroom_id IS NULL) OR "
            "(student_id IS NULL AND classroom_id IS NOT NULL)",
            name="ck_assignment_target",
        ),
    )
    op.create_index("ix_lab_assignments_lab_id", "lab_assignments", ["lab_id"])
    op.create_index("ix_lab_assignments_student_id", "lab_assignments", ["student_id"])
    op.create_index("ix_lab_assignments_classroom_id", "lab_assignments", ["classroom_id"])
    op.create_index("ix_lab_assignments_tenant_id", "lab_assignments", ["tenant_id"])

    # --- submission_feedback table ---
    op.create_table(
        "submission_feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instructor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feedback_text", sa.String(5000), nullable=False),
        sa.Column("grade", sa.String(20), nullable=True),
        sa.Column("rubric_scores", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_submission_feedback_project_id", "submission_feedback", ["project_id"])
    op.create_index("ix_submission_feedback_tenant_id", "submission_feedback", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("submission_feedback")
    op.drop_table("lab_assignments")
    op.drop_column("projects", "status")
    op.drop_column("student_memberships", "ui_mode_override")
