"""Tenant analytics daily rollups + analytics RBAC + enterprise export feature.

Revision ID: 046_tenant_analytics
Revises: 045_attendance_excusal
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "046_tenant_analytics"
down_revision: Union[str, None] = "045_attendance_excusal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_analytics_daily",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bucket_date", sa.Date(), nullable=False),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("dimension_key", sa.String(40), nullable=False),
        sa.Column("enrolled_students", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active_students", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lesson_completions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lab_completions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lesson_progress_updates", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lab_progress_updates", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assignments_submitted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assignments_saved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assignments_on_time", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assignments_late", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attendance_present", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attendance_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("presence_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("median_lesson_score", sa.Numeric(10, 4), nullable=True),
        sa.Column("median_lab_score", sa.Numeric(10, 4), nullable=True),
        sa.Column("mean_lesson_score", sa.Numeric(10, 4), nullable=True),
        sa.Column("mean_lab_score", sa.Numeric(10, 4), nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "tenant_id",
            "bucket_date",
            "dimension",
            "dimension_key",
            name="uq_tenant_analytics_daily_dim",
        ),
    )
    op.create_index("ix_tenant_analytics_daily_tenant_bucket", "tenant_analytics_daily", ["tenant_id", "bucket_date"])
    op.create_index(
        "ix_tenant_analytics_daily_tenant_dimension",
        "tenant_analytics_daily",
        ["tenant_id", "dimension", "dimension_key"],
    )

    op.create_index(
        "ix_lesson_progress_tenant_completed_at",
        "lesson_progress",
        ["tenant_id", "completed_at"],
    )
    op.create_index(
        "ix_lab_progress_tenant_completed_at",
        "lab_progress",
        ["tenant_id", "completed_at"],
    )
    op.create_index(
        "ix_classroom_session_events_tenant_created",
        "classroom_session_events",
        ["tenant_id", "created_at"],
    )

    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        SELECT gen_random_uuid(), 'analytics', 'view', 'View tenant analytics dashboards'
        WHERE NOT EXISTS (
            SELECT 1 FROM permissions WHERE resource = 'analytics' AND action = 'view'
        );
        """
    )
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        SELECT gen_random_uuid(), 'analytics', 'export', 'Export tenant analytics (Enterprise)'
        WHERE NOT EXISTS (
            SELECT 1 FROM permissions WHERE resource = 'analytics' AND action = 'export'
        );
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r
        JOIN permissions p ON p.resource = 'analytics' AND p.action = 'view'
        WHERE r.slug IN ('owner', 'admin')
          AND r.tenant_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r
        JOIN permissions p ON p.resource = 'analytics' AND p.action = 'export'
        WHERE r.slug = 'owner'
          AND r.tenant_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;
        """
    )

    op.execute(
        """
        INSERT INTO plan_features (id, plan_id, feature_key, enabled)
        SELECT gen_random_uuid(), p.id, 'analytics_export', true
        FROM plans p
        WHERE p.slug = 'enterprise'
        ON CONFLICT ON CONSTRAINT uq_plan_feature DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM plan_features
        WHERE feature_key = 'analytics_export'
          AND plan_id IN (SELECT id FROM plans WHERE slug = 'enterprise');
        """
    )
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE resource = 'analytics'
        );
        """
    )
    op.execute("DELETE FROM permissions WHERE resource = 'analytics';")

    op.drop_index("ix_classroom_session_events_tenant_created", table_name="classroom_session_events")
    op.drop_index("ix_lab_progress_tenant_completed_at", table_name="lab_progress")
    op.drop_index("ix_lesson_progress_tenant_completed_at", table_name="lesson_progress")

    op.drop_index("ix_tenant_analytics_daily_tenant_dimension", table_name="tenant_analytics_daily")
    op.drop_index("ix_tenant_analytics_daily_tenant_bucket", table_name="tenant_analytics_daily")
    op.drop_table("tenant_analytics_daily")
