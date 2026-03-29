"""email_provider_domain_health: per-provider per-recipient-domain routing state.

Revision ID: 035_email_provider_domain_health
Revises: 034_trial_grants_user_set_null
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "035_email_provider_domain_health"
down_revision: Union[str, None] = "034_trial_grants_user_set_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_provider_domain_health",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("failure_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "domain",
            name="uq_email_provider_domain_health_pd",
        ),
    )
    op.create_index(
        "ix_email_provider_domain_health_domain",
        "email_provider_domain_health",
        ["domain"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_provider_domain_health_domain", table_name="email_provider_domain_health")
    op.drop_table("email_provider_domain_health")
