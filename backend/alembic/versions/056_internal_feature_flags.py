"""Internal feature flags and aggregate analytics tables.

Revision ID: 056_internal_feature_flags
Revises: 055_curriculum_assignment_policy
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "056_internal_feature_flags"
down_revision: Union[str, None] = "055_curriculum_assignment_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("owner", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("stage", sa.String(length=20), nullable=False, server_default="dev"),
        sa.Column("default_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("allow_debug_events", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("fail_mode", sa.String(length=20), nullable=False, server_default="closed"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("key", name="uq_feature_flags_key"),
    )
    op.create_index("ix_feature_flags_key", "feature_flags", ["key"])

    op.create_table(
        "feature_flag_rules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rule_type", sa.String(length=30), nullable=False, server_default="targeting"),
        sa.Column("match_operator", sa.String(length=10), nullable=False, server_default="all"),
        sa.Column(
            "conditions_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("rollout_percentage", sa.Integer(), nullable=True),
        sa.Column("variant", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["feature_flags.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_feature_flag_rules_flag_id", "feature_flag_rules", ["flag_id"])

    op.create_table(
        "feature_flag_targets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_key", sa.String(length=191), nullable=False),
        sa.Column("stage", sa.String(length=20), nullable=False, server_default="any"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("variant", sa.String(length=80), nullable=True),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["feature_flags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "flag_id", "target_type", "target_key", "stage", name="uq_feature_flag_target_scope"
        ),
    )
    op.create_index("ix_feature_flag_targets_flag_id", "feature_flag_targets", ["flag_id"])

    op.create_table(
        "feature_flag_variants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["feature_flags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("flag_id", "key", name="uq_feature_flag_variant"),
    )
    op.create_index("ix_feature_flag_variants_flag_id", "feature_flag_variants", ["flag_id"])

    op.create_table(
        "feature_flag_metric_buckets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bucket_granularity", sa.String(length=10), nullable=False, server_default="day"),
        sa.Column("dimension_key", sa.String(length=40), nullable=False, server_default="all"),
        sa.Column("dimension_value", sa.String(length=120), nullable=False, server_default="all"),
        sa.Column("on_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("off_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "variant_counts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["feature_flags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "flag_id",
            "bucket_start",
            "bucket_granularity",
            "dimension_key",
            "dimension_value",
            name="uq_feature_flag_metric_bucket",
        ),
    )
    op.create_index("ix_feature_flag_metric_buckets_flag_id", "feature_flag_metric_buckets", ["flag_id"])
    op.create_index("ix_feature_flag_metric_buckets_bucket_start", "feature_flag_metric_buckets", ["bucket_start"])
    op.create_index(
        "ix_feature_flag_metric_bucket_flag_dim",
        "feature_flag_metric_buckets",
        ["flag_id", "bucket_start", "dimension_key", "dimension_value"],
    )

    op.create_table(
        "feature_flag_debug_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("flag_key", sa.String(length=120), nullable=False),
        sa.Column("subject_type", sa.String(length=20), nullable=False, server_default="anonymous"),
        sa.Column("subject_key", sa.String(length=191), nullable=False, server_default="anonymous"),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("stage", sa.String(length=20), nullable=False, server_default="dev"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("variant", sa.String(length=80), nullable=True),
        sa.Column("decision_source", sa.String(length=50), nullable=False, server_default="default"),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "traits_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["feature_flags.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_feature_flag_debug_events_flag_key", "feature_flag_debug_events", ["flag_key"])
    op.create_index("ix_feature_flag_debug_events_created_at", "feature_flag_debug_events", ["created_at"])
    op.create_index("ix_feature_flag_debug_events_tenant_id", "feature_flag_debug_events", ["tenant_id"])
    op.create_index("ix_feature_flag_debug_events_flag_id", "feature_flag_debug_events", ["flag_id"])

    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES
          (gen_random_uuid(), 'platform.feature_flags', 'view', 'View internal feature flags'),
          (gen_random_uuid(), 'platform.feature_flags', 'manage', 'Manage internal feature flags')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r
        JOIN permissions p
          ON p.resource = 'platform.feature_flags'
         AND p.action IN ('view', 'manage')
        WHERE r.slug IN ('platform_owner', 'platform_admin')
          AND r.tenant_id IS NULL
        ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
          SELECT id FROM permissions WHERE resource = 'platform.feature_flags'
        );
        """
    )
    op.execute("DELETE FROM permissions WHERE resource = 'platform.feature_flags';")

    op.drop_index("ix_feature_flag_debug_events_flag_id", table_name="feature_flag_debug_events")
    op.drop_index("ix_feature_flag_debug_events_tenant_id", table_name="feature_flag_debug_events")
    op.drop_index("ix_feature_flag_debug_events_created_at", table_name="feature_flag_debug_events")
    op.drop_index("ix_feature_flag_debug_events_flag_key", table_name="feature_flag_debug_events")
    op.drop_table("feature_flag_debug_events")

    op.drop_index("ix_feature_flag_metric_bucket_flag_dim", table_name="feature_flag_metric_buckets")
    op.drop_index("ix_feature_flag_metric_buckets_bucket_start", table_name="feature_flag_metric_buckets")
    op.drop_index("ix_feature_flag_metric_buckets_flag_id", table_name="feature_flag_metric_buckets")
    op.drop_table("feature_flag_metric_buckets")

    op.drop_index("ix_feature_flag_variants_flag_id", table_name="feature_flag_variants")
    op.drop_table("feature_flag_variants")

    op.drop_index("ix_feature_flag_targets_flag_id", table_name="feature_flag_targets")
    op.drop_table("feature_flag_targets")

    op.drop_index("ix_feature_flag_rules_flag_id", table_name="feature_flag_rules")
    op.drop_table("feature_flag_rules")

    op.drop_index("ix_feature_flags_key", table_name="feature_flags")
    op.drop_table("feature_flags")
