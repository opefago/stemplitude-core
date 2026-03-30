"""Tenant public host labels, hierarchy governance, franchise join requests.

Revision ID: 041_tenant_hosts_franchise
Revises: 040_member_inv_purchase
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "041_tenant_hosts_franchise"
down_revision: Union[str, None] = "040_member_inv_purchase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("public_host_subdomain", sa.String(63), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("custom_domain", sa.String(253), nullable=True),
    )
    op.create_index(
        "ix_tenants_public_host_subdomain",
        "tenants",
        ["public_host_subdomain"],
        unique=True,
    )
    op.create_index(
        "ix_tenants_custom_domain",
        "tenants",
        ["custom_domain"],
        unique=True,
    )

    op.add_column(
        "tenant_hierarchy",
        sa.Column("governance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "tenant_hierarchy_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("child_tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message", sa.String(1000), nullable=True),
        sa.Column("preferred_billing_mode", sa.String(20), nullable=True),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decided_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["child_tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tenant_hierarchy_requests_parent",
        "tenant_hierarchy_requests",
        ["parent_tenant_id", "status"],
    )
    op.create_index(
        "ix_tenant_hierarchy_requests_child",
        "tenant_hierarchy_requests",
        ["child_tenant_id"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_tenant_hierarchy_req_child_pending
        ON tenant_hierarchy_requests (child_tenant_id)
        WHERE status = 'pending';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_tenant_hierarchy_req_child_pending;")
    op.drop_index("ix_tenant_hierarchy_requests_child", table_name="tenant_hierarchy_requests")
    op.drop_index("ix_tenant_hierarchy_requests_parent", table_name="tenant_hierarchy_requests")
    op.drop_table("tenant_hierarchy_requests")
    op.drop_column("tenant_hierarchy", "governance")
    op.drop_index("ix_tenants_custom_domain", table_name="tenants")
    op.drop_index("ix_tenants_public_host_subdomain", table_name="tenants")
    op.drop_column("tenants", "custom_domain")
    op.drop_column("tenants", "public_host_subdomain")
