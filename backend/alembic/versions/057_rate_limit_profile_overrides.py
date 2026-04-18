"""Rate limit profile overrides for tenant/user scopes.

Revision ID: 057_rate_limit_profile_overrides
Revises: 056_internal_feature_flags
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "057_rate_limit_profile_overrides"
down_revision: Union[str, None] = "056_internal_feature_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_profile_overrides",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("scope_type", sa.String(length=20), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_key", sa.String(length=80), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("scope_type", "scope_id", name="uq_rate_limit_profile_scope"),
    )
    op.create_index(
        "ix_rate_limit_profile_overrides_scope_type",
        "rate_limit_profile_overrides",
        ["scope_type"],
    )
    op.create_index(
        "ix_rate_limit_profile_overrides_scope_id",
        "rate_limit_profile_overrides",
        ["scope_id"],
    )
    op.create_index(
        "ix_rate_limit_profile_overrides_profile_key",
        "rate_limit_profile_overrides",
        ["profile_key"],
    )
    op.create_index(
        "ix_rate_limit_profile_overrides_updated_by",
        "rate_limit_profile_overrides",
        ["updated_by"],
    )

    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES
          (gen_random_uuid(), 'platform.rate_limits', 'view', 'View rate limit profiles and overrides'),
          (gen_random_uuid(), 'platform.rate_limits', 'manage', 'Manage rate limit profiles and overrides')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r
        JOIN permissions p
          ON p.resource = 'platform.rate_limits'
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
          SELECT id FROM permissions WHERE resource = 'platform.rate_limits'
        );
        """
    )
    op.execute("DELETE FROM permissions WHERE resource = 'platform.rate_limits';")

    op.drop_index(
        "ix_rate_limit_profile_overrides_updated_by",
        table_name="rate_limit_profile_overrides",
    )
    op.drop_index(
        "ix_rate_limit_profile_overrides_profile_key",
        table_name="rate_limit_profile_overrides",
    )
    op.drop_index(
        "ix_rate_limit_profile_overrides_scope_id",
        table_name="rate_limit_profile_overrides",
    )
    op.drop_index(
        "ix_rate_limit_profile_overrides_scope_type",
        table_name="rate_limit_profile_overrides",
    )
    op.drop_table("rate_limit_profile_overrides")
