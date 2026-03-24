"""Add platform growth permissions and finance/growth roles.

Revision ID: 029_platform_growth_roles
Revises: 028_growth_affiliate_hardening
Create Date: 2026-03-23 11:10:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "029_platform_growth_roles"
down_revision: Union[str, None] = "028_growth_affiliate_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # platform.growth permissions
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES (gen_random_uuid(), 'platform.growth', 'view', 'View growth operations data')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES (gen_random_uuid(), 'platform.growth', 'manage', 'Manage promos, affiliates, and commissions')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES (gen_random_uuid(), 'platform.billing', 'view', 'View platform billing settings')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO permissions (id, resource, action, description)
        VALUES (gen_random_uuid(), 'platform.billing', 'manage', 'Manage platform billing settings')
        ON CONFLICT (resource, action) DO NOTHING;
        """
    )

    # new global roles
    op.execute(
        """
        INSERT INTO roles (id, tenant_id, name, slug, is_system, is_active, created_at)
        SELECT gen_random_uuid(), NULL, 'Platform Finance', 'platform_finance', true, true, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM roles WHERE slug = 'platform_finance' AND tenant_id IS NULL
        );
        """
    )
    op.execute(
        """
        INSERT INTO roles (id, tenant_id, name, slug, is_system, is_active, created_at)
        SELECT gen_random_uuid(), NULL, 'Growth Ops', 'growth_ops', true, true, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM roles WHERE slug = 'growth_ops' AND tenant_id IS NULL
        );
        """
    )

    # platform_finance permissions
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'platform_finance' AND r.tenant_id IS NULL
          AND (
            (p.resource = 'platform.growth' AND p.action IN ('view', 'manage'))
            OR (p.resource = 'platform.analytics' AND p.action = 'view')
            OR (p.resource = 'platform.entities' AND p.action = 'view')
            OR (p.resource = 'platform.tenants' AND p.action = 'view')
            OR (p.resource = 'platform.billing' AND p.action IN ('view', 'manage'))
          )
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
          );
        """
    )

    # growth_ops permissions
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'growth_ops' AND r.tenant_id IS NULL
          AND (
            (p.resource = 'platform.growth' AND p.action IN ('view', 'manage'))
            OR (p.resource = 'platform.analytics' AND p.action = 'view')
          )
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
          );
        """
    )

    # make sure existing broad admins can access growth pages
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug IN ('platform_owner', 'platform_admin')
          AND r.tenant_id IS NULL
          AND p.resource = 'platform.growth'
          AND p.action IN ('view', 'manage')
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
          );
        """
    )


def downgrade() -> None:
    # Keep downgrade safe/no-op in mixed environments.
    pass

