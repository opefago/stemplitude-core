"""Trial signup tracking (one cardless trial per email; abuse signals).

Revision ID: 033_trial_grants
Revises: 032_progress_updated_at
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "033_trial_grants"
down_revision: Union[str, None] = "032_progress_updated_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trial_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email_normalized", sa.String(320), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("signup_ip", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email_normalized", name="uq_trial_grants_email_normalized"),
    )
    op.create_index("ix_trial_grants_user_id", "trial_grants", ["user_id"])
    op.create_index("ix_trial_grants_tenant_id", "trial_grants", ["tenant_id"])
    op.create_index("ix_trial_grants_created_at", "trial_grants", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_trial_grants_created_at", table_name="trial_grants")
    op.drop_index("ix_trial_grants_tenant_id", table_name="trial_grants")
    op.drop_index("ix_trial_grants_user_id", table_name="trial_grants")
    op.drop_table("trial_grants")
