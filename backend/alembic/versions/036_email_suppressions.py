"""email_suppressions: per-address opt-out for non-transactional mail.

Revision ID: 036_email_suppressions
Revises: 035_email_provider_domain_health
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "036_email_suppressions"
down_revision: Union[str, None] = "035_email_provider_domain_health"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_suppressions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email_normalized", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scope", sa.String(length=32), nullable=False, server_default="non_transactional"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="one_click"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_suppressions_email_normalized",
        "email_suppressions",
        ["email_normalized"],
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_global ON email_suppressions "
        "(email_normalized) WHERE tenant_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_tenant ON email_suppressions "
        "(email_normalized, tenant_id) WHERE tenant_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_tenant")
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_global")
    op.drop_index("ix_email_suppressions_email_normalized", table_name="email_suppressions")
    op.drop_table("email_suppressions")
