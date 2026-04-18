"""Homepage templates table.

Revision ID: 060_homepage_templates
Revises: 059_member_billing_tax_support
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "060_homepage_templates"
down_revision: Union[str, None] = "059_member_billing_tax_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "homepage_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("gradient", sa.String(length=300), nullable=False, server_default=""),
        sa.Column(
            "sections",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "is_builtin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("slug", name="uq_homepage_templates_slug"),
    )
    op.create_index("ix_homepage_templates_category", "homepage_templates", ["category"])
    op.create_index("ix_homepage_templates_is_active", "homepage_templates", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_homepage_templates_is_active", table_name="homepage_templates")
    op.drop_index("ix_homepage_templates_category", table_name="homepage_templates")
    op.drop_table("homepage_templates")
