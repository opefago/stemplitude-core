"""Add platform blob finder permission.

Revision ID: 008_platform_blob_finder
Revises: 007_realtime_session_state
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008_platform_blob_finder"
down_revision: Union[str, None] = "007_realtime_session_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES (
            gen_random_uuid(),
            'platform.blobs',
            'view',
            'View platform blob finder'
        )
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r
        JOIN permissions p ON p.resource = 'platform.blobs' AND p.action = 'view'
        WHERE r.tenant_id IS NULL
          AND r.slug IN ('platform_owner', 'platform_admin', 'support')
          AND NOT EXISTS (
              SELECT 1
              FROM role_permissions rp
              WHERE rp.role_id = r.id
                AND rp.permission_id = p.id
          );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions rp
        USING permissions p
        WHERE rp.permission_id = p.id
          AND p.resource = 'platform.blobs'
          AND p.action = 'view';
        """
    )

    op.execute(
        """
        DELETE FROM permissions
        WHERE resource = 'platform.blobs' AND action = 'view';
        """
    )
