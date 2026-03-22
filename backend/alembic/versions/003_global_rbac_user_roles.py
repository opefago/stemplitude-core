"""Global RBAC: user_roles table, platform permissions, system roles, super-admin migration.

Revision ID: 003_global_rbac
Revises: 002_lab_assignments
Create Date: 2026-03-15

Creates user_roles table for global (platform-level) role assignments.
Seeds platform permissions, 4 system global roles, links them via role_permissions.
Migrates existing is_super_admin users to platform_owner role.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "003_global_rbac"
down_revision: Union[str, None] = "002_lab_assignments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. Create user_roles table ---
    op.create_table(
        "user_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.true(), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    # --- 2. Seed global platform permissions ---
    _seed_platform_permissions()

    # --- 3. Seed 4 system global roles (tenant_id=NULL, is_system=True) ---
    _seed_platform_roles()

    # --- 4. Link permissions to roles via role_permissions ---
    _link_role_permissions()

    # --- 5. Migrate is_super_admin users to platform_owner ---
    op.execute("""
        INSERT INTO user_roles (id, user_id, role_id, is_active, created_at)
        SELECT gen_random_uuid(), u.id, r.id, true, now()
        FROM users u, roles r
        WHERE u.is_super_admin = true AND r.slug = 'platform_owner' AND r.tenant_id IS NULL
        ON CONFLICT (user_id, role_id) DO NOTHING;
    """)


def _seed_platform_permissions() -> None:
    perms = [
        ("platform.tasks", "view", "View admin task console"),
        ("platform.tasks", "execute", "Execute admin tasks"),
        ("platform.tasks", "manage", "Manage admin tasks"),
        ("platform.health", "view", "View platform health"),
        ("platform.health", "run", "Run health checks"),
        ("platform.analytics", "view", "View platform analytics"),
        ("platform.analytics", "export", "Export analytics data"),
        ("platform.jobs", "view", "View background jobs"),
        ("platform.jobs", "manage", "Manage background jobs"),
        ("platform.entities", "view", "View platform entities"),
        ("platform.entities", "export", "Export entity data"),
        ("platform.impersonation", "execute", "Impersonate users"),
        ("platform.users", "view", "View platform users"),
        ("platform.users", "manage", "Manage platform users"),
        ("platform.tenants", "view", "View tenants"),
        ("platform.tenants", "manage", "Manage tenants"),
    ]
    for resource, action, desc in perms:
        op.execute(
            f"""
            INSERT INTO permissions (id, resource, action, description)
            VALUES (gen_random_uuid(), '{resource}', '{action}', '{desc.replace("'", "''")}')
            ON CONFLICT (resource, action) DO NOTHING;
            """
        )


def _seed_platform_roles() -> None:
    roles = [
        ("Platform Owner", "platform_owner"),
        ("Platform Admin", "platform_admin"),
        ("DevOps", "devops"),
        ("Support", "support"),
    ]
    for name, slug in roles:
        op.execute(
            f"""
            INSERT INTO roles (id, tenant_id, name, slug, is_system, is_active, created_at)
            SELECT gen_random_uuid(), NULL, '{name.replace("'", "''")}', '{slug}', true, true, now()
            WHERE NOT EXISTS (
                SELECT 1 FROM roles WHERE slug = '{slug}' AND tenant_id IS NULL
            );
            """
        )


def _link_role_permissions() -> None:
    # Platform Owner: ALL platform permissions
    op.execute("""
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'platform_owner' AND r.tenant_id IS NULL
        AND p.resource LIKE 'platform.%'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    """)

    # Platform Admin: all except platform.users:manage and platform.impersonation:execute
    op.execute("""
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'platform_admin' AND r.tenant_id IS NULL
        AND p.resource LIKE 'platform.%'
        AND NOT (p.resource = 'platform.users' AND p.action = 'manage')
        AND NOT (p.resource = 'platform.impersonation' AND p.action = 'execute')
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    """)

    # DevOps: platform.health:*, platform.jobs:*, platform.tasks:*
    op.execute("""
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'devops' AND r.tenant_id IS NULL
        AND (
            (p.resource = 'platform.health')
            OR (p.resource = 'platform.jobs')
            OR (p.resource = 'platform.tasks')
        )
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    """)

    # Support: platform.entities:view, platform.impersonation:execute, platform.analytics:view, platform.tenants:view
    op.execute("""
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), r.id, p.id
        FROM roles r, permissions p
        WHERE r.slug = 'support' AND r.tenant_id IS NULL
        AND (
            (p.resource = 'platform.entities' AND p.action = 'view')
            OR (p.resource = 'platform.impersonation' AND p.action = 'execute')
            OR (p.resource = 'platform.analytics' AND p.action = 'view')
            OR (p.resource = 'platform.tenants' AND p.action = 'view')
        )
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    """)


def downgrade() -> None:
    # Remove user_roles for platform_owner (migrated super admins)
    op.execute("""
        DELETE FROM user_roles ur
        USING roles r
        WHERE ur.role_id = r.id AND r.slug = 'platform_owner' AND r.tenant_id IS NULL;
    """)

    # Remove role_permissions for platform roles
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE tenant_id IS NULL);
    """)

    # Remove platform roles
    op.execute("DELETE FROM roles WHERE tenant_id IS NULL AND is_system = true;")

    # Remove platform permissions
    op.execute("DELETE FROM permissions WHERE resource LIKE 'platform.%';")

    # Drop user_roles table
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_table("user_roles")
