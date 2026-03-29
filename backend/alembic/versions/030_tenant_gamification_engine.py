"""Add tenant gamification goals and lab event stream tables.

Revision ID: 030_tenant_gamification_engine
Revises: 029_platform_growth_roles
Create Date: 2026-03-17 15:40:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "030_tenant_gamification_engine"
down_revision: Union[str, None] = "029_platform_growth_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gamification_goals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            lab_type VARCHAR(60) NOT NULL,
            name VARCHAR(140) NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            event_map JSONB NOT NULL DEFAULT '{}'::jsonb,
            conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
            reward JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            updated_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_gamification_goals_tenant_lab_name UNIQUE (tenant_id, lab_type, name)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_gamification_goals_tenant_id
        ON gamification_goals (tenant_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_gamification_goals_lab_type
        ON gamification_goals (lab_type)
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lab_event_stream (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            lab_id VARCHAR(120) NOT NULL,
            lab_type VARCHAR(60) NOT NULL,
            event_type VARCHAR(80) NOT NULL,
            context JSONB NOT NULL DEFAULT '{}'::jsonb,
            goal_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
            points_awarded INTEGER NOT NULL DEFAULT 0,
            occurred_at TIMESTAMPTZ NOT NULL,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lab_event_stream_tenant_id
        ON lab_event_stream (tenant_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lab_event_stream_user_id
        ON lab_event_stream (user_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lab_event_stream_lab_type
        ON lab_event_stream (lab_type)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lab_event_stream_event_type
        ON lab_event_stream (event_type)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lab_event_stream_occurred_at
        ON lab_event_stream (occurred_at)
        """
    )


def downgrade() -> None:
    # Keep downgrade safe/no-op in mixed environments.
    pass
