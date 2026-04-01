"""Add assignment grading and rubric rollup columns to tenant_analytics_daily.

Revision ID: 047_analytics_grades
Revises: 046_tenant_analytics
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "047_analytics_grades"
down_revision: Union[str, None] = "046_tenant_analytics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_analytics_daily",
        sa.Column("assignments_graded", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "tenant_analytics_daily",
        sa.Column("median_assignment_score", sa.Numeric(10, 4), nullable=True),
    )
    op.add_column(
        "tenant_analytics_daily",
        sa.Column("mean_assignment_score", sa.Numeric(10, 4), nullable=True),
    )
    op.add_column(
        "tenant_analytics_daily",
        sa.Column("mean_rubric_compliance", sa.Numeric(10, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_analytics_daily", "mean_rubric_compliance")
    op.drop_column("tenant_analytics_daily", "mean_assignment_score")
    op.drop_column("tenant_analytics_daily", "median_assignment_score")
    op.drop_column("tenant_analytics_daily", "assignments_graded")
