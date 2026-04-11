"""Role Manager — backend logic for platform global role management.

Global roles have tenant_id IS NULL. This module provides listing, assignment,
and removal of global roles for users.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.roles.models import Permission, Role, RolePermission, UserRole
from app.users.models import User


async def list_roles_with_details(session: AsyncSession) -> list[dict[str, Any]]:
    """List all global roles (tenant_id IS NULL) with permissions and user counts.

    Returns a list of dicts with keys:
        slug, name, is_system, is_active, created_at, user_count, permissions
    where permissions is a dict of resource -> list of actions.
    """
    roles_result = await session.execute(
        select(Role)
        .where(Role.tenant_id.is_(None))
        .order_by(Role.slug)
    )
    roles = roles_result.scalars().all()

    if not roles:
        return []

    role_ids = [r.id for r in roles]

    # Fetch all role permissions for these roles
    rp_result = await session.execute(
        select(RolePermission.role_id, Permission.resource, Permission.action)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id.in_(role_ids))
    )
    role_perms = rp_result.all()

    # Build permissions dict per role: resource -> [actions]
    perms_by_role: dict[UUID, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for role_id, resource, action in role_perms:
        perms_by_role[role_id][resource].append(action)

    # User counts per role (active UserRole entries only)
    count_result = await session.execute(
        select(UserRole.role_id, func.count(UserRole.id).label("cnt"))
        .where(
            UserRole.role_id.in_(role_ids),
            UserRole.is_active == True,
        )
        .group_by(UserRole.role_id)
    )
    counts = {row.role_id: row.cnt for row in count_result.all()}

    out: list[dict[str, Any]] = []
    for r in roles:
        perms = perms_by_role.get(r.id, {})
        # Convert defaultdict to plain dict of resource -> sorted actions
        perms_serialized = {res: sorted(acts) for res, acts in perms.items()}
        out.append({
            "id": str(r.id),
            "slug": r.slug,
            "name": r.name,
            "is_system": r.is_system,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user_count": counts.get(r.id, 0),
            "permissions": perms_serialized,
        })
    return out


async def list_user_assignments(session: AsyncSession) -> list[dict[str, Any]]:
    """List all users with global role assignments.

    Returns list of dicts with:
        user_id, email, first_name, last_name, role_slug, role_name, is_active,
        assigned_at, granted_by_email
    """
    Granter = aliased(User, name="granter")
    result = await session.execute(
        select(
            User.id,
            User.email,
            User.first_name,
            User.last_name,
            Role.slug,
            Role.name,
            UserRole.is_active,
            UserRole.created_at,
            Granter.email,
        )
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, UserRole.role_id == Role.id)
        .outerjoin(Granter, UserRole.granted_by == Granter.id)
        .where(
            Role.tenant_id.is_(None),
            UserRole.is_active == True,
        )
        .order_by(User.email, Role.slug)
    )
    rows = result.all()

    return [
        {
            "user_id": str(row[0]),
            "email": row[1],
            "first_name": row[2],
            "last_name": row[3],
            "role_slug": row[4],
            "role_name": row[5],
            "is_active": row[6],
            "assigned_at": row[7].isoformat() if row[7] else None,
            "granted_by_email": row[8],
        }
        for row in rows
    ]


async def assign_role_to_user(
    session: AsyncSession,
    email: str,
    role_slug: str,
    *,
    granted_by: UUID | None = None,
) -> dict[str, Any]:
    """Assign a global role to a user by email.

    Finds user by email, finds role by slug (tenant_id IS NULL), deactivates
    any existing global role assignments, and creates a new UserRole entry.

    Returns {"ok": True, "message": "..."} or {"ok": False, "error": "..."}.
    """
    user_result = await session.execute(
        select(User).where(User.email == email)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User not found: {email}"}

    role_result = await session.execute(
        select(Role)
        .where(
            Role.slug == role_slug,
            Role.tenant_id.is_(None),
            Role.is_active == True,
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        return {"ok": False, "error": f"Global role not found: {role_slug}"}

    # Deactivate existing global role assignments for this user
    existing_result = await session.execute(
        select(UserRole)
        .join(Role, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user.id,
            UserRole.is_active == True,
            Role.tenant_id.is_(None),
        )
    )
    for ur in existing_result.scalars().all():
        ur.is_active = False

    pair_result = await session.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == role.id,
        )
    )
    row = pair_result.scalar_one_or_none()
    if row:
        row.is_active = True
        row.granted_by = granted_by
    else:
        session.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
                is_active=True,
                granted_by=granted_by,
            )
        )
    await session.flush()

    return {
        "ok": True,
        "message": f"Assigned role '{role_slug}' to {email}",
    }


async def remove_user_role(
    session: AsyncSession,
    email: str,
) -> dict[str, Any]:
    """Remove a user's global role assignment by email.

    Finds user by email and deletes their UserRole entries linked to global roles.

    Returns {"ok": True, "message": "..."} or {"ok": False, "error": "..."}.
    """
    user_result = await session.execute(
        select(User).where(User.email == email)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User not found: {email}"}

    # Delete UserRole entries for this user where role is global
    delete_stmt = (
        delete(UserRole)
        .where(UserRole.user_id == user.id)
        .where(
            UserRole.role_id.in_(
                select(Role.id).where(Role.tenant_id.is_(None))
            )
        )
    )
    result = await session.execute(delete_stmt)
    deleted = result.rowcount
    await session.flush()

    if deleted == 0:
        return {"ok": False, "error": f"User {email} has no global role assignment"}

    return {
        "ok": True,
        "message": f"Removed global role from {email}",
    }
