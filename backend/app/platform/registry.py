"""Whitelisted command registry for the platform admin task runner.

Every command is an explicit Python handler -- NO shell execution.
Each handler receives validated, typed parameters and a database session.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.licenses.models import License, LicenseFeature, LicenseLimit, SeatUsage
from app.plans.models import Plan, PlanFeature, PlanLimit
from app.roles.models import Role, RolePermission, UserRole
from app.roles.repository import RoleRepository
from app.subscriptions.models import Subscription
from app.tenants.models import Membership, Tenant
from app.users.models import User

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
_CODE_RE = re.compile(r"^[A-Za-z0-9]{4,20}$")

VALID_GLOBAL_ROLES = (
    "platform_owner",
    "platform_admin",
    "devops",
    "support",
    "platform_finance",
    "growth_ops",
)
DEFAULT_TENANT_ROLES = [
    ("admin", "Admin"),
    ("instructor", "Instructor"),
    ("student", "Student"),
]


@dataclass
class ParamDef:
    name: str
    long: str
    short: str | None = None
    required: bool = False
    help: str = ""
    default: str | None = None
    param_type: str = "str"
    pattern: re.Pattern | None = None
    allowed: tuple[str, ...] | None = None


@dataclass
class CommandDef:
    domain: str
    action: str
    help: str
    params: list[ParamDef] = field(default_factory=list)
    handler: Callable[..., Coroutine[Any, Any, dict]] | None = None


CommandResult = dict[str, Any]

_REGISTRY: dict[str, CommandDef] = {}


def register(cmd: CommandDef) -> CommandDef:
    key = f"{cmd.domain}:{cmd.action}"
    _REGISTRY[key] = cmd
    return cmd


def get_command(key: str) -> CommandDef | None:
    return _REGISTRY.get(key)


def list_commands() -> list[dict]:
    return [
        {
            "domain": c.domain,
            "action": c.action,
            "help": c.help,
            "params": [
                {
                    "long": p.long,
                    "short": p.short,
                    "required": p.required,
                    "help": p.help,
                    "default": p.default,
                }
                for p in c.params
            ],
        }
        for c in _REGISTRY.values()
    ]


def validate_params(cmd: CommandDef, raw: dict[str, str]) -> dict[str, str]:
    """Validate and sanitize parameters against the command definition.

    Raises ValueError with a descriptive message on any violation.
    """
    validated: dict[str, str] = {}
    alias_map: dict[str, ParamDef] = {}
    for p in cmd.params:
        alias_map[p.long.lstrip("-")] = p
        alias_map[p.long] = p
        if p.short:
            alias_map[p.short.lstrip("-")] = p
            alias_map[p.short] = p

    for key, value in raw.items():
        clean_key = key.lstrip("-")
        pdef = alias_map.get(clean_key) or alias_map.get(key)
        if pdef is None:
            raise ValueError(f"Unknown parameter: {key}")

        value = value.strip()
        if len(value) > 1024:
            raise ValueError(f"Parameter '{key}' exceeds max length (1024)")

        if pdef.pattern and not pdef.pattern.match(value):
            raise ValueError(
                f"Parameter '{pdef.long}' has invalid format"
            )
        if pdef.allowed and value not in pdef.allowed:
            raise ValueError(
                f"Parameter '{pdef.long}' must be one of: {', '.join(pdef.allowed)}"
            )

        canonical = pdef.long.lstrip("-")
        validated[canonical] = value

    for p in cmd.params:
        canonical = p.long.lstrip("-")
        if p.required and canonical not in validated:
            raise ValueError(f"Missing required parameter: {p.long}")
        if canonical not in validated and p.default is not None:
            validated[canonical] = p.default

    return validated


# ─── Handlers ───────────────────────────────────────────────────────────────


async def _resolve_global_role(session: AsyncSession, slug: str) -> Role | None:
    result = await session.execute(
        select(Role).where(
            Role.slug == slug,
            Role.tenant_id.is_(None),
            Role.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _assign_global_role(
    session: AsyncSession, user: User, role: Role
) -> None:
    existing = await session.execute(
        select(UserRole).where(
            UserRole.user_id == user.id, UserRole.is_active == True  # noqa: E712
        )
    )
    for ur in existing.scalars().all():
        ur.is_active = False

    session.add(
        UserRole(user_id=user.id, role_id=role.id, is_active=True)
    )
    if not user.is_super_admin:
        user.is_super_admin = True


# ── users:create ──

_PASSWORD_RE = re.compile(r"^.{12,128}$")


async def handle_users_create(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params["email"]
    password = params["password"]
    first_name = params.get("first-name", "New")
    last_name = params.get("last-name", "User")

    if len(password) < 12:
        return {"ok": False, "error": "Password must be at least 12 characters"}

    existing = await session.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        return {"ok": False, "error": f"User with email '{email}' already exists"}

    user = User(
        email=email,
        password_hash=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        is_active=True,
    )
    session.add(user)
    await session.flush()

    return {
        "ok": True,
        "message": f"User '{email}' created",
        "user_id": str(user.id),
        "email": email,
        "name": f"{first_name} {last_name}".strip(),
    }


register(
    CommandDef(
        domain="users",
        action="create",
        help="Create a new user account",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="Email address", pattern=_EMAIL_RE,
            ),
            ParamDef(
                name="password", long="--password", short="-p",
                required=True, help="Password (min 12 chars)",
                pattern=_PASSWORD_RE,
            ),
            ParamDef(
                name="first-name", long="--first-name", short="-f",
                help="First name", default="New",
            ),
            ParamDef(
                name="last-name", long="--last-name", short="-l",
                help="Last name", default="User",
            ),
        ],
        handler=handle_users_create,
    )
)


# ── users:get ──

async def handle_users_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params.get("email")
    uid = params.get("id")

    if not email and not uid:
        return {"ok": False, "error": "Provide --email or --id"}

    q = select(User)
    if email:
        q = q.where(User.email == email)
    elif uid:
        from uuid import UUID as _UUID
        try:
            q = q.where(User.id == _UUID(uid))
        except ValueError:
            return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": "User not found"}

    global_role_name = None
    if user.is_super_admin:
        role_result = await session.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user.id,
                UserRole.is_active == True,  # noqa: E712
                Role.tenant_id.is_(None),
            )
        )
        gr = role_result.scalar_one_or_none()
        if gr:
            global_role_name = gr.slug

    memberships_result = await session.execute(
        select(Tenant.slug, Tenant.name, Role.slug)
        .select_from(Membership)
        .join(Tenant, Membership.tenant_id == Tenant.id)
        .outerjoin(Role, Membership.role_id == Role.id)
        .where(
            Membership.user_id == user.id,
            Membership.is_active == True,  # noqa: E712
        )
    )
    tenants = [
        {"slug": t_slug, "name": t_name, "role": r_slug}
        for t_slug, t_name, r_slug in memberships_result.all()
    ]

    return {
        "ok": True,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": f"{user.first_name} {user.last_name}".strip(),
            "active": user.is_active,
            "super_admin": user.is_super_admin,
            "global_role": global_role_name,
            "tenants": tenants,
            "created": user.created_at.isoformat() if user.created_at else None,
        },
    }


register(
    CommandDef(
        domain="users",
        action="get",
        help="Get user details including tenants and global role",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                help="User email", pattern=_EMAIL_RE,
            ),
            ParamDef(name="id", long="--id", help="User UUID"),
        ],
        handler=handle_users_get,
    )
)


# ── users:deactivate ──

async def handle_users_deactivate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params["email"]
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User '{email}' not found"}
    if not user.is_active:
        return {"ok": True, "message": f"User '{email}' is already inactive"}
    user.is_active = False
    await session.flush()
    return {"ok": True, "message": f"User '{email}' deactivated"}


register(
    CommandDef(
        domain="users",
        action="deactivate",
        help="Deactivate a user account",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="User email", pattern=_EMAIL_RE,
            ),
        ],
        handler=handle_users_deactivate,
    )
)


# ── users:activate ──

async def handle_users_activate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params["email"]
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User '{email}' not found"}
    if user.is_active:
        return {"ok": True, "message": f"User '{email}' is already active"}
    user.is_active = True
    await session.flush()
    return {"ok": True, "message": f"User '{email}' activated"}


register(
    CommandDef(
        domain="users",
        action="activate",
        help="Activate a user account",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="User email", pattern=_EMAIL_RE,
            ),
        ],
        handler=handle_users_activate,
    )
)


# ── users:list-admins ──

async def handle_users_list_admins(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    result = await session.execute(
        select(User, Role)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, UserRole.role_id == Role.id)
        .where(UserRole.is_active == True, Role.tenant_id.is_(None))  # noqa: E712
        .order_by(User.created_at)
    )
    rows = result.all()
    items = [
        {
            "email": u.email,
            "name": f"{u.first_name} {u.last_name}".strip(),
            "role": r.slug,
            "active": u.is_active,
            "created": u.created_at.isoformat() if u.created_at else None,
        }
        for u, r in rows
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="users",
        action="list-admins",
        help="List all users with global roles",
        params=[],
        handler=handle_users_list_admins,
    )
)


# ── users:set-role ──

async def handle_users_set_role(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params["email"]
    role_slug = params["role"]

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User '{email}' not found"}

    global_role = await _resolve_global_role(session, role_slug)
    if not global_role:
        return {"ok": False, "error": f"Global role '{role_slug}' not found"}

    await _assign_global_role(session, user, global_role)
    await session.flush()
    return {
        "ok": True,
        "message": f"User '{email}' assigned global role '{role_slug}'",
    }


register(
    CommandDef(
        domain="users",
        action="set-role",
        help="Assign a global role to a user",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="User email", pattern=_EMAIL_RE,
            ),
            ParamDef(
                name="role", long="--role", short="-r",
                required=True, help="Global role slug",
                allowed=VALID_GLOBAL_ROLES,
            ),
        ],
        handler=handle_users_set_role,
    )
)


# ── users:remove-role ──

async def handle_users_remove_role(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    email = params["email"]

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User '{email}' not found"}

    existing = await session.execute(
        select(UserRole).where(
            UserRole.user_id == user.id, UserRole.is_active == True  # noqa: E712
        )
    )
    count = 0
    for ur in existing.scalars().all():
        ur.is_active = False
        count += 1

    if count == 0:
        return {"ok": True, "message": f"User '{email}' has no active global role"}

    user.is_super_admin = False
    await session.flush()
    return {
        "ok": True,
        "message": f"Removed global role from '{email}' ({count} deactivated)",
    }


register(
    CommandDef(
        domain="users",
        action="remove-role",
        help="Remove a user's global role",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="User email", pattern=_EMAIL_RE,
            ),
        ],
        handler=handle_users_remove_role,
    )
)


# ── tenants:list ──

async def handle_tenants_list(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    q = select(Tenant).order_by(Tenant.created_at.desc())
    active_only = params.get("active-only")
    if active_only and active_only.lower() in ("true", "1", "yes"):
        q = q.where(Tenant.is_active == True)  # noqa: E712
    result = await session.execute(q)
    tenants = result.scalars().all()
    items = [
        {
            "slug": t.slug,
            "name": t.name,
            "code": t.code,
            "type": t.type,
            "active": t.is_active,
            "created": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tenants
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="tenants",
        action="list",
        help="List all tenants",
        params=[
            ParamDef(
                name="active-only", long="--active-only",
                help="Only show active tenants",
            ),
        ],
        handler=handle_tenants_list,
    )
)


# ── tenants:get ──

async def handle_tenants_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params.get("slug")
    code = params.get("code")
    tid = params.get("id")

    if not slug and not code and not tid:
        return {"ok": False, "error": "Provide at least --slug, --code, or --id"}

    q = select(Tenant)
    if slug:
        q = q.where(Tenant.slug == slug)
    elif code:
        q = q.where(Tenant.code == code.upper())
    elif tid:
        from uuid import UUID
        try:
            q = q.where(Tenant.id == UUID(tid))
        except ValueError:
            return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(q)
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": "Tenant not found"}

    member_count = await session.execute(
        select(func.count()).select_from(Membership).where(
            Membership.tenant_id == tenant.id,
            Membership.is_active == True,  # noqa: E712
        )
    )

    return {
        "ok": True,
        "tenant": {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "code": tenant.code,
            "type": tenant.type,
            "active": tenant.is_active,
            "members": member_count.scalar() or 0,
            "created": tenant.created_at.isoformat() if tenant.created_at else None,
        },
    }


register(
    CommandDef(
        domain="tenants",
        action="get",
        help="Get tenant details",
        params=[
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug"),
            ParamDef(name="code", long="--code", short="-c", help="Tenant code"),
            ParamDef(name="id", long="--id", help="Tenant UUID"),
        ],
        handler=handle_tenants_get,
    )
)


# ── tenants:create ──

async def handle_tenants_create(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    name = params["name"]
    slug = params["slug"]
    code = params["code"].upper()
    tenant_type = params.get("type", "center")
    owner_email = params.get("owner")

    existing = await session.execute(
        select(Tenant).where((Tenant.slug == slug) | (Tenant.code == code))
    )
    if existing.scalar_one_or_none():
        return {
            "ok": False,
            "error": f"Tenant with slug '{slug}' or code '{code}' already exists",
        }

    owner: User | None = None
    if owner_email:
        result = await session.execute(
            select(User).where(User.email == owner_email)
        )
        owner = result.scalar_one_or_none()
        if not owner:
            return {"ok": False, "error": f"User '{owner_email}' not found"}

    tenant = Tenant(
        name=name, slug=slug, code=code, type=tenant_type,
        settings={}, is_active=True,
    )
    session.add(tenant)
    await session.flush()

    for role_slug, role_name in DEFAULT_TENANT_ROLES:
        session.add(
            Role(
                tenant_id=tenant.id, name=role_name,
                slug=role_slug, is_system=True,
            )
        )
    await session.flush()

    if owner:
        admin_role_result = await session.execute(
            select(Role).where(
                Role.tenant_id == tenant.id, Role.slug == "admin"
            )
        )
        admin_role = admin_role_result.scalar_one_or_none()
        session.add(
            Membership(
                user_id=owner.id, tenant_id=tenant.id,
                role_id=admin_role.id if admin_role else None,
                is_active=True,
            )
        )
        await session.flush()

    return {
        "ok": True,
        "message": f"Tenant '{name}' ({slug}) created",
        "tenant_id": str(tenant.id),
    }


register(
    CommandDef(
        domain="tenants",
        action="create",
        help="Create a new tenant with default roles",
        params=[
            ParamDef(
                name="name", long="--name", short="-n",
                required=True, help="Display name",
            ),
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="URL-safe identifier", pattern=_SLUG_RE,
            ),
            ParamDef(
                name="code", long="--code", short="-c",
                required=True, help="Student login code (4-20 chars)",
                pattern=_CODE_RE,
            ),
            ParamDef(
                name="type", long="--type", short="-t",
                help="Tenant type", default="center",
                allowed=("center", "parent"),
            ),
            ParamDef(
                name="owner", long="--owner", short="-o",
                help="Admin user email", pattern=_EMAIL_RE,
            ),
        ],
        handler=handle_tenants_create,
    )
)


# ── tenants:deactivate ──

async def handle_tenants_deactivate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]
    result = await session.execute(
        select(Tenant).where(Tenant.slug == slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": f"Tenant '{slug}' not found"}
    if not tenant.is_active:
        return {"ok": True, "message": f"Tenant '{slug}' is already inactive"}
    tenant.is_active = False
    await session.flush()
    return {"ok": True, "message": f"Tenant '{slug}' deactivated"}


register(
    CommandDef(
        domain="tenants",
        action="deactivate",
        help="Deactivate a tenant",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Tenant slug", pattern=_SLUG_RE,
            ),
        ],
        handler=handle_tenants_deactivate,
    )
)


# ── tenants:activate ──

async def handle_tenants_activate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]
    result = await session.execute(
        select(Tenant).where(Tenant.slug == slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": f"Tenant '{slug}' not found"}
    if tenant.is_active:
        return {"ok": True, "message": f"Tenant '{slug}' is already active"}
    tenant.is_active = True
    await session.flush()
    return {"ok": True, "message": f"Tenant '{slug}' activated"}


register(
    CommandDef(
        domain="tenants",
        action="activate",
        help="Activate a tenant",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Tenant slug", pattern=_SLUG_RE,
            ),
        ],
        handler=handle_tenants_activate,
    )
)


# ── tenants:add-member ──

async def handle_tenants_add_member(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]
    email = params["email"]
    role_slug = params["role"]

    result = await session.execute(
        select(Tenant).where(Tenant.slug == slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": f"Tenant '{slug}' not found"}

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": False, "error": f"User '{email}' not found"}

    role_result = await session.execute(
        select(Role).where(
            Role.tenant_id == tenant.id, Role.slug == role_slug
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        return {
            "ok": False,
            "error": f"Role '{role_slug}' not found for tenant '{slug}'",
        }

    existing = await session.execute(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": False, "error": f"User '{email}' is already a member of '{slug}'"}

    session.add(
        Membership(
            user_id=user.id, tenant_id=tenant.id,
            role_id=role.id, is_active=True,
        )
    )
    await session.flush()
    return {
        "ok": True,
        "message": f"Added '{email}' to '{slug}' as {role_slug}",
    }


register(
    CommandDef(
        domain="tenants",
        action="add-member",
        help="Add a user to a tenant",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Tenant slug", pattern=_SLUG_RE,
            ),
            ParamDef(
                name="email", long="--email", short="-e",
                required=True, help="User email", pattern=_EMAIL_RE,
            ),
            ParamDef(
                name="role", long="--role", short="-r",
                required=True, help="Role slug (admin, instructor, student)",
            ),
        ],
        handler=handle_tenants_add_member,
    )
)


# ── tenants:list-members ──

async def handle_tenants_list_members(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]

    result = await session.execute(
        select(Tenant).where(Tenant.slug == slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": f"Tenant '{slug}' not found"}

    rows = await session.execute(
        select(User, Role, Membership)
        .join(Membership, Membership.user_id == User.id)
        .outerjoin(Role, Membership.role_id == Role.id)
        .where(Membership.tenant_id == tenant.id)
        .order_by(Membership.created_at.desc())
    )
    members = rows.all()

    items = [
        {
            "email": u.email,
            "name": f"{u.first_name} {u.last_name}".strip(),
            "role": r.slug if r else None,
            "active": m.is_active,
            "joined": m.created_at.isoformat() if m.created_at else None,
            "user_id": str(u.id),
        }
        for u, r, m in members
    ]
    return {
        "ok": True,
        "tenant": slug,
        "count": len(items),
        "items": items,
    }


register(
    CommandDef(
        domain="tenants",
        action="list-members",
        help="List all members of a tenant",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Tenant slug", pattern=_SLUG_RE,
            ),
        ],
        handler=handle_tenants_list_members,
    )
)


# ── Tenant roles & permissions (tenant-scoped RBAC) ──────────────────────────

async def _resolve_tenant_by_slug_or_id(
    session: AsyncSession, params: dict[str, str]
) -> tuple[Tenant | None, str | None]:
    """Exactly one of --slug or --tenant-id must be set."""
    slug = params.get("slug")
    tid = params.get("tenant-id")
    if bool(slug) == bool(tid):
        return None, "Provide exactly one of --slug or --tenant-id"
    if tid:
        from uuid import UUID

        try:
            u = UUID(tid)
        except ValueError:
            return None, "Invalid UUID for --tenant-id"
        result = await session.execute(select(Tenant).where(Tenant.id == u))
    else:
        if not _SLUG_RE.match(slug or ""):
            return None, "Invalid format for --slug"
        result = await session.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None, "Tenant not found"
    return tenant, None


def _split_permissions_csv(params: dict[str, str]) -> list[str]:
    raw = params.get("permissions", "")
    if not raw or not raw.strip():
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


async def _permissions_from_keys(
    repo: RoleRepository, keys: list[str]
) -> tuple[list | None, str | None]:
    from uuid import UUID

    out: list = []
    seen: set[UUID] = set()
    for raw in keys:
        raw = raw.strip()
        if not raw:
            continue
        if ":" not in raw:
            return None, f"Permission '{raw}' must be resource:action"
        resource, action = raw.split(":", 1)
        resource, action = resource.strip(), action.strip()
        perm = await repo.get_permission_by_resource_action(resource, action)
        if not perm:
            return None, f"Unknown permission '{raw}'"
        if perm.id not in seen:
            seen.add(perm.id)
            out.append(perm)
    return out, None


async def handle_tenants_list_roles(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    tenant, err = await _resolve_tenant_by_slug_or_id(session, params)
    if err:
        return {"ok": False, "error": err}
    repo = RoleRepository(session)
    roles = await repo.list_roles(tenant.id, include_inactive=True)
    items = []
    for r in roles:
        n = len(await repo.get_role_permission_ids(r.id))
        items.append(
            {
                "slug": r.slug,
                "name": r.name,
                "system": r.is_system,
                "active": r.is_active,
                "permissions": n,
            }
        )
    return {
        "ok": True,
        "tenant": tenant.slug,
        "tenant_id": str(tenant.id),
        "count": len(items),
        "items": items,
    }


async def handle_tenants_show_role(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    role_slug = params["role-slug"]
    tenant, err = await _resolve_tenant_by_slug_or_id(session, params)
    if err:
        return {"ok": False, "error": err}
    repo = RoleRepository(session)
    role = await repo.get_role_by_slug(tenant.id, role_slug)
    if not role:
        return {
            "ok": False,
            "error": f"Role '{role_slug}' not found on tenant '{tenant.slug}'",
        }
    perms = await repo.get_role_permissions(role.id)
    keys = sorted(f"{p.resource}:{p.action}" for p in perms)
    return {
        "ok": True,
        "tenant": tenant.slug,
        "role": {
            "id": str(role.id),
            "slug": role.slug,
            "name": role.name,
            "system": role.is_system,
            "active": role.is_active,
        },
        "count": len(keys),
        "items": [{"permission": k} for k in keys],
    }


async def handle_tenants_create_role(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    role_name = params["role-name"]
    role_slug = params["role-slug"]
    tenant, err = await _resolve_tenant_by_slug_or_id(session, params)
    if err:
        return {"ok": False, "error": err}
    if not _SLUG_RE.match(role_slug):
        return {"ok": False, "error": "Invalid format for --role-slug"}

    repo = RoleRepository(session)
    existing = await repo.get_role_by_slug(tenant.id, role_slug)
    if existing:
        return {
            "ok": False,
            "error": f"Role '{role_slug}' already exists on tenant '{tenant.slug}'",
        }

    system = params.get("system", "false").lower() in ("true", "1", "yes")
    template = params.get("template")
    extra_keys = _split_permissions_csv(params)

    perm_ids: set = set()
    if template:
        template_role = await repo.get_role_by_slug(tenant.id, template)
        if not template_role:
            return {
                "ok": False,
                "error": f"Template role '{template}' not found on tenant '{tenant.slug}'",
            }
        perm_ids |= await repo.get_role_permission_ids(template_role.id)
    if extra_keys:
        resolved, perr = await _permissions_from_keys(repo, extra_keys)
        if perr:
            return {"ok": False, "error": perr}
        perm_ids |= {p.id for p in resolved}

    new_role = Role(
        tenant_id=tenant.id,
        name=role_name,
        slug=role_slug,
        is_system=system,
    )
    session.add(new_role)
    await session.flush()

    for pid in perm_ids:
        session.add(RolePermission(role_id=new_role.id, permission_id=pid))
    await session.flush()

    return {
        "ok": True,
        "message": f"Role '{role_slug}' created on '{tenant.slug}'",
        "tenant": tenant.slug,
        "role": {
            "id": str(new_role.id),
            "slug": new_role.slug,
            "name": new_role.name,
            "system": new_role.is_system,
        },
        "permissions_granted": len(perm_ids),
    }


async def handle_tenants_add_role_permissions(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    role_slug = params["role-slug"]
    tenant, err = await _resolve_tenant_by_slug_or_id(session, params)
    if err:
        return {"ok": False, "error": err}
    keys = _split_permissions_csv(params)
    if not keys:
        return {"ok": False, "error": "Provide --permissions as comma-separated resource:action"}

    repo = RoleRepository(session)
    role = await repo.get_role_by_slug(tenant.id, role_slug)
    if not role:
        return {
            "ok": False,
            "error": f"Role '{role_slug}' not found on tenant '{tenant.slug}'",
        }
    allow_system = params.get("allow-system", "false").lower() in ("true", "1", "yes")
    if role.is_system and not allow_system:
        return {
            "ok": False,
            "error": "Cannot modify system roles without --allow-system true",
        }

    to_add, perr = await _permissions_from_keys(repo, keys)
    if perr:
        return {"ok": False, "error": perr}
    existing = await repo.get_role_permission_ids(role.id)
    added = 0
    for perm in to_add:
        if perm.id in existing:
            continue
        await repo.add_role_permission(role.id, perm.id)
        added += 1
    await session.flush()
    return {
        "ok": True,
        "message": f"Added {added} permission(s) to '{role_slug}' on '{tenant.slug}'",
        "added": added,
    }


async def handle_tenants_remove_role_permissions(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    role_slug = params["role-slug"]
    tenant, err = await _resolve_tenant_by_slug_or_id(session, params)
    if err:
        return {"ok": False, "error": err}
    keys = _split_permissions_csv(params)
    if not keys:
        return {"ok": False, "error": "Provide --permissions as comma-separated resource:action"}

    repo = RoleRepository(session)
    role = await repo.get_role_by_slug(tenant.id, role_slug)
    if not role:
        return {
            "ok": False,
            "error": f"Role '{role_slug}' not found on tenant '{tenant.slug}'",
        }
    allow_system = params.get("allow-system", "false").lower() in ("true", "1", "yes")
    if role.is_system and not allow_system:
        return {
            "ok": False,
            "error": "Cannot modify system roles without --allow-system true",
        }

    to_remove, perr = await _permissions_from_keys(repo, keys)
    if perr:
        return {"ok": False, "error": perr}
    removed = 0
    for perm in to_remove:
        if await repo.remove_role_permission(role.id, perm.id):
            removed += 1
    await session.flush()
    return {
        "ok": True,
        "message": f"Removed {removed} permission(s) from '{role_slug}' on '{tenant.slug}'",
        "removed": removed,
    }


async def handle_tenants_permissions_catalog(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    _ = params
    repo = RoleRepository(session)
    perms = await repo.list_permissions()
    items = [
        {
            "permission": f"{p.resource}:{p.action}",
            "description": p.description or "",
        }
        for p in perms
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="tenants",
        action="list-roles",
        help="List tenant roles with permission counts (use --slug or --tenant-id)",
        params=[
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug", pattern=_SLUG_RE),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
        ],
        handler=handle_tenants_list_roles,
    )
)

register(
    CommandDef(
        domain="tenants",
        action="show-role",
        help="Show one tenant role and its permissions",
        params=[
            ParamDef(
                name="role-slug", long="--role-slug", short="-r",
                required=True, help="Role slug on the tenant",
            ),
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug", pattern=_SLUG_RE),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
        ],
        handler=handle_tenants_show_role,
    )
)

register(
    CommandDef(
        domain="tenants",
        action="create-role",
        help="Create a tenant role; optional --template and --permissions",
        params=[
            ParamDef(name="role-name", long="--role-name", required=True, help="Display name"),
            ParamDef(
                name="role-slug", long="--role-slug",
                required=True, help="URL-safe role slug", pattern=_SLUG_RE,
            ),
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug", pattern=_SLUG_RE),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
            ParamDef(
                name="template", long="--template", short="-t",
                help="Copy permissions from this role slug",
            ),
            ParamDef(
                name="permissions", long="--permissions",
                help="Comma-separated resource:action (merged with template)",
            ),
            ParamDef(
                name="system", long="--system",
                help="Mark as system role", default="false",
            ),
        ],
        handler=handle_tenants_create_role,
    )
)

register(
    CommandDef(
        domain="tenants",
        action="add-role-permissions",
        help="Add permissions to a tenant role",
        params=[
            ParamDef(
                name="role-slug", long="--role-slug", short="-r",
                required=True, help="Role slug",
            ),
            ParamDef(
                name="permissions", long="--permissions",
                required=True, help="Comma-separated resource:action",
            ),
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug", pattern=_SLUG_RE),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
            ParamDef(
                name="allow-system", long="--allow-system",
                help="Allow editing system roles", default="false",
            ),
        ],
        handler=handle_tenants_add_role_permissions,
    )
)

register(
    CommandDef(
        domain="tenants",
        action="remove-role-permissions",
        help="Remove permissions from a tenant role",
        params=[
            ParamDef(
                name="role-slug", long="--role-slug", short="-r",
                required=True, help="Role slug",
            ),
            ParamDef(
                name="permissions", long="--permissions",
                required=True, help="Comma-separated resource:action",
            ),
            ParamDef(name="slug", long="--slug", short="-s", help="Tenant slug", pattern=_SLUG_RE),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
            ParamDef(
                name="allow-system", long="--allow-system",
                help="Allow editing system roles", default="false",
            ),
        ],
        handler=handle_tenants_remove_role_permissions,
    )
)

register(
    CommandDef(
        domain="tenants",
        action="permissions-catalog",
        help="List all platform permission keys (resource:action)",
        params=[],
        handler=handle_tenants_permissions_catalog,
    )
)


# ─── Plan Handlers ───────────────────────────────────────────────────────────

_PLAN_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
_PLAN_TYPES = ("free", "starter", "pro", "enterprise", "custom")
_PRICE_RE = re.compile(r"^\d+(\.\d{1,2})?$")


# ── plans:list ──

async def handle_plans_list(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    q = select(Plan).order_by(Plan.created_at.desc())
    active_only = params.get("active-only")
    if active_only and active_only.lower() in ("true", "1", "yes"):
        q = q.where(Plan.is_active == True)  # noqa: E712
    result = await session.execute(q)
    plans = result.scalars().all()
    items = [
        {
            "id": str(p.id),
            "name": p.name,
            "slug": p.slug,
            "type": p.type,
            "price_monthly": float(p.price_monthly) if p.price_monthly else None,
            "price_yearly": float(p.price_yearly) if p.price_yearly else None,
            "trial_days": p.trial_days,
            "active": p.is_active,
            "created": p.created_at.isoformat() if p.created_at else None,
        }
        for p in plans
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="plans",
        action="list",
        help="List all plans",
        params=[
            ParamDef(
                name="active-only", long="--active-only",
                help="Only show active plans",
            ),
        ],
        handler=handle_plans_list,
    )
)


# ── plans:get ──

async def handle_plans_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params.get("slug")
    pid = params.get("id")

    if not slug and not pid:
        return {"ok": False, "error": "Provide --slug or --id"}

    q = select(Plan)
    if slug:
        q = q.where(Plan.slug == slug)
    elif pid:
        from uuid import UUID
        try:
            q = q.where(Plan.id == UUID(pid))
        except ValueError:
            return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(q)
    plan = result.scalar_one_or_none()
    if not plan:
        return {"ok": False, "error": "Plan not found"}

    features_result = await session.execute(
        select(PlanFeature).where(PlanFeature.plan_id == plan.id)
    )
    features = [
        {"key": f.feature_key, "enabled": f.enabled}
        for f in features_result.scalars().all()
    ]

    limits_result = await session.execute(
        select(PlanLimit).where(PlanLimit.plan_id == plan.id)
    )
    limits = [
        {"key": lm.limit_key, "value": lm.limit_value}
        for lm in limits_result.scalars().all()
    ]

    return {
        "ok": True,
        "plan": {
            "id": str(plan.id),
            "name": plan.name,
            "slug": plan.slug,
            "type": plan.type,
            "price_monthly": float(plan.price_monthly) if plan.price_monthly else None,
            "price_yearly": float(plan.price_yearly) if plan.price_yearly else None,
            "trial_days": plan.trial_days,
            "active": plan.is_active,
            "features": features,
            "limits": limits,
            "created": plan.created_at.isoformat() if plan.created_at else None,
        },
    }


register(
    CommandDef(
        domain="plans",
        action="get",
        help="Get plan details with features and limits",
        params=[
            ParamDef(name="slug", long="--slug", short="-s", help="Plan slug"),
            ParamDef(name="id", long="--id", help="Plan UUID"),
        ],
        handler=handle_plans_get,
    )
)


# ── plans:create ──

async def handle_plans_create(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    name = params["name"]
    slug = params["slug"]
    plan_type = params.get("type", "starter")
    price_monthly = params.get("price-monthly")
    price_yearly = params.get("price-yearly")
    trial_days = params.get("trial-days", "0")

    existing = await session.execute(
        select(Plan).where(Plan.slug == slug)
    )
    if existing.scalar_one_or_none():
        return {"ok": False, "error": f"Plan with slug '{slug}' already exists"}

    plan = Plan(
        name=name,
        slug=slug,
        type=plan_type,
        price_monthly=float(price_monthly) if price_monthly else None,
        price_yearly=float(price_yearly) if price_yearly else None,
        trial_days=int(trial_days),
        is_active=True,
    )
    session.add(plan)
    await session.flush()

    return {
        "ok": True,
        "message": f"Plan '{name}' ({slug}) created",
        "plan_id": str(plan.id),
        "changes": {
            "action": "created",
            "entity": "plan",
            "new_state": {
                "id": str(plan.id), "name": name, "slug": slug,
                "type": plan_type, "is_active": True,
                "price_monthly": float(price_monthly) if price_monthly else None,
                "price_yearly": float(price_yearly) if price_yearly else None,
                "trial_days": int(trial_days),
            },
        },
    }


register(
    CommandDef(
        domain="plans",
        action="create",
        help="Create a new plan",
        params=[
            ParamDef(
                name="name", long="--name", short="-n",
                required=True, help="Display name",
            ),
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="URL-safe identifier", pattern=_PLAN_SLUG_RE,
            ),
            ParamDef(
                name="type", long="--type", short="-t",
                help="Plan type", default="starter",
                allowed=_PLAN_TYPES,
            ),
            ParamDef(
                name="price-monthly", long="--price-monthly",
                help="Monthly price (e.g. 29.99)", pattern=_PRICE_RE,
            ),
            ParamDef(
                name="price-yearly", long="--price-yearly",
                help="Yearly price (e.g. 299.99)", pattern=_PRICE_RE,
            ),
            ParamDef(
                name="trial-days", long="--trial-days",
                help="Trial period in days", default="0",
            ),
        ],
        handler=handle_plans_create,
    )
)


# ── plans:deactivate ──

async def handle_plans_deactivate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]
    result = await session.execute(select(Plan).where(Plan.slug == slug))
    plan = result.scalar_one_or_none()
    if not plan:
        return {"ok": False, "error": f"Plan '{slug}' not found"}
    if not plan.is_active:
        return {"ok": True, "message": f"Plan '{slug}' is already inactive"}
    plan.is_active = False
    await session.flush()
    return {
        "ok": True,
        "message": f"Plan '{slug}' deactivated",
        "changes": {
            "action": "deactivated",
            "entity": "plan",
            "entity_id": str(plan.id),
            "slug": slug,
            "previous_state": {"is_active": True},
            "new_state": {"is_active": False},
        },
    }


register(
    CommandDef(
        domain="plans",
        action="deactivate",
        help="Deactivate a plan",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Plan slug", pattern=_PLAN_SLUG_RE,
            ),
        ],
        handler=handle_plans_deactivate,
    )
)


# ── plans:activate ──

async def handle_plans_activate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    slug = params["slug"]
    result = await session.execute(select(Plan).where(Plan.slug == slug))
    plan = result.scalar_one_or_none()
    if not plan:
        return {"ok": False, "error": f"Plan '{slug}' not found"}
    if plan.is_active:
        return {"ok": True, "message": f"Plan '{slug}' is already active"}
    plan.is_active = True
    await session.flush()
    return {
        "ok": True,
        "message": f"Plan '{slug}' activated",
        "changes": {
            "action": "activated",
            "entity": "plan",
            "entity_id": str(plan.id),
            "slug": slug,
            "previous_state": {"is_active": False},
            "new_state": {"is_active": True},
        },
    }


register(
    CommandDef(
        domain="plans",
        action="activate",
        help="Activate a plan",
        params=[
            ParamDef(
                name="slug", long="--slug", short="-s",
                required=True, help="Plan slug", pattern=_PLAN_SLUG_RE,
            ),
        ],
        handler=handle_plans_activate,
    )
)


# ─── Subscription Handlers ───────────────────────────────────────────────────

VALID_SUB_STATUSES = ("trialing", "active", "past_due", "canceled", "unpaid")


# ── subscriptions:list ──

async def handle_subscriptions_list(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    q = (
        select(Subscription, Tenant.slug, Tenant.name, Plan.slug, Plan.name, User.email)
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .join(User, Subscription.user_id == User.id)
        .order_by(Subscription.created_at.desc())
    )

    tenant_slug = params.get("tenant")
    if tenant_slug:
        q = q.where(Tenant.slug == tenant_slug)

    status = params.get("status")
    if status:
        q = q.where(Subscription.status == status)

    result = await session.execute(q)
    rows = result.all()
    items = [
        {
            "id": str(sub.id),
            "tenant_slug": t_slug,
            "tenant_name": t_name,
            "plan_slug": p_slug,
            "plan_name": p_name,
            "user_email": u_email,
            "status": sub.status,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "created": sub.created_at.isoformat() if sub.created_at else None,
        }
        for sub, t_slug, t_name, p_slug, p_name, u_email in rows
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="subscriptions",
        action="list",
        help="List subscriptions, optionally filtered by tenant or status",
        params=[
            ParamDef(
                name="tenant", long="--tenant", short="-t",
                help="Filter by tenant slug",
            ),
            ParamDef(
                name="status", long="--status", short="-s",
                help="Filter by status",
                allowed=VALID_SUB_STATUSES,
            ),
        ],
        handler=handle_subscriptions_list,
    )
)


# ── subscriptions:get ──

async def handle_subscriptions_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    sid = params.get("id")
    if not sid:
        return {"ok": False, "error": "Provide --id"}

    from uuid import UUID
    try:
        sub_uuid = UUID(sid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(Subscription, Tenant.slug, Tenant.name, Plan.slug, Plan.name, User.email)
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .join(User, Subscription.user_id == User.id)
        .where(Subscription.id == sub_uuid)
    )
    row = result.one_or_none()
    if not row:
        return {"ok": False, "error": "Subscription not found"}

    sub, t_slug, t_name, p_slug, p_name, u_email = row

    return {
        "ok": True,
        "subscription": {
            "id": str(sub.id),
            "tenant": {"slug": t_slug, "name": t_name},
            "plan": {"slug": p_slug, "name": p_name},
            "user_email": u_email,
            "status": sub.status,
            "stripe_subscription_id": sub.stripe_subscription_id,
            "stripe_customer_id": sub.stripe_customer_id,
            "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
            "promo_code": sub.promo_code,
            "created": sub.created_at.isoformat() if sub.created_at else None,
        },
    }


register(
    CommandDef(
        domain="subscriptions",
        action="get",
        help="Get subscription details",
        params=[
            ParamDef(name="id", long="--id", required=True, help="Subscription UUID"),
        ],
        handler=handle_subscriptions_get,
    )
)


# ── subscriptions:cancel ──

async def handle_subscriptions_cancel(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    from datetime import datetime, timezone
    from uuid import UUID

    sid = params["id"]
    try:
        sub_uuid = UUID(sid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(Subscription, Tenant.slug, Plan.slug)
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(Subscription.id == sub_uuid)
    )
    row = result.one_or_none()
    if not row:
        return {"ok": False, "error": "Subscription not found"}

    sub, tenant_slug, plan_slug = row

    if sub.status == "canceled":
        return {"ok": True, "message": "Subscription is already canceled"}

    previous_status = sub.status
    canceled_at = datetime.now(timezone.utc)
    sub.status = "canceled"
    sub.canceled_at = canceled_at
    await session.flush()
    return {
        "ok": True,
        "message": f"Subscription {sid} canceled",
        "changes": {
            "action": "canceled",
            "entity": "subscription",
            "entity_id": sid,
            "tenant_slug": tenant_slug,
            "plan_slug": plan_slug,
            "previous_state": {"status": previous_status, "canceled_at": None},
            "new_state": {"status": "canceled", "canceled_at": canceled_at.isoformat()},
        },
    }


register(
    CommandDef(
        domain="subscriptions",
        action="cancel",
        help="Cancel a subscription",
        params=[
            ParamDef(name="id", long="--id", required=True, help="Subscription UUID"),
        ],
        handler=handle_subscriptions_cancel,
    )
)


# ── subscriptions:status ──

async def handle_subscriptions_status(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    """Look up a tenant's subscription by slug with full plan + expiration info."""
    from datetime import datetime, timezone

    tenant_slug = params.get("tenant")
    email = params.get("email")

    if not tenant_slug and not email:
        return {"ok": False, "error": "Provide --tenant (slug) or --email"}

    q = (
        select(
            Subscription, Tenant.slug, Tenant.name,
            Plan.slug, Plan.name, Plan.type,
            Plan.price_monthly, Plan.price_yearly,
            Plan.trial_days, User.email,
        )
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .join(User, Subscription.user_id == User.id)
        .order_by(Subscription.created_at.desc())
    )

    if tenant_slug:
        q = q.where(Tenant.slug == tenant_slug)
    if email:
        q = q.where(User.email == email)

    result = await session.execute(q)
    rows = result.all()

    if not rows:
        return {"ok": False, "error": "No subscriptions found"}

    now = datetime.now(timezone.utc)
    items = []
    for sub, t_slug, t_name, p_slug, p_name, p_type, p_monthly, p_yearly, p_trial, u_email in rows:
        period_end = sub.current_period_end
        trial_end = sub.trial_end

        days_remaining = None
        is_expired = False
        if period_end:
            delta = period_end - now
            days_remaining = max(0, delta.days)
            is_expired = delta.total_seconds() < 0

        is_trialing = sub.status == "trialing"
        trial_days_remaining = None
        if is_trialing and trial_end:
            trial_delta = trial_end - now
            trial_days_remaining = max(0, trial_delta.days)

        items.append({
            "subscription_id": str(sub.id),
            "status": sub.status,
            "is_expired": is_expired,
            "tenant": {"slug": t_slug, "name": t_name},
            "plan": {
                "slug": p_slug,
                "name": p_name,
                "type": p_type,
                "price_monthly": float(p_monthly) if p_monthly else None,
                "price_yearly": float(p_yearly) if p_yearly else None,
                "trial_days": p_trial,
            },
            "subscriber_email": u_email,
            "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
            "current_period_end": period_end.isoformat() if period_end else None,
            "days_remaining": days_remaining,
            "trial_end": trial_end.isoformat() if trial_end else None,
            "trial_days_remaining": trial_days_remaining,
            "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
            "promo_code": sub.promo_code,
            "created": sub.created_at.isoformat() if sub.created_at else None,
        })

    return {"ok": True, "count": len(items), "subscriptions": items}


register(
    CommandDef(
        domain="subscriptions",
        action="status",
        help="Get a tenant's subscription with plan details and expiration info",
        params=[
            ParamDef(
                name="tenant", long="--tenant", short="-t",
                help="Tenant slug",
            ),
            ParamDef(
                name="email", long="--email", short="-e",
                help="Subscriber email",
            ),
        ],
        handler=handle_subscriptions_status,
    )
)


# ── subscriptions:expiring ──

async def handle_subscriptions_expiring(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    """Find subscriptions expiring within N days."""
    from datetime import datetime, timedelta, timezone

    days = int(params.get("days", "30"))
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    q = (
        select(
            Subscription, Tenant.slug, Tenant.name,
            Plan.slug, Plan.name, User.email,
        )
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .join(User, Subscription.user_id == User.id)
        .where(
            Subscription.current_period_end.isnot(None),
            Subscription.current_period_end <= cutoff,
            Subscription.current_period_end >= now,
            Subscription.status.in_(("active", "trialing", "past_due")),
        )
        .order_by(Subscription.current_period_end.asc())
    )

    result = await session.execute(q)
    rows = result.all()

    items = [
        {
            "subscription_id": str(sub.id),
            "tenant_slug": t_slug,
            "tenant_name": t_name,
            "plan_slug": p_slug,
            "plan_name": p_name,
            "subscriber_email": u_email,
            "status": sub.status,
            "current_period_end": sub.current_period_end.isoformat(),
            "days_remaining": max(0, (sub.current_period_end - now).days),
        }
        for sub, t_slug, t_name, p_slug, p_name, u_email in rows
    ]
    return {
        "ok": True,
        "window_days": days,
        "count": len(items),
        "items": items,
    }


async def handle_subscriptions_reconcile_stripe(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    from uuid import UUID

    from app.subscriptions.stripe_reconcile import run_stripe_reconcile_for_tenant

    slug = params.get("tenant")
    tid = params.get("tenant-id")
    if bool(slug) == bool(tid):
        return {"ok": False, "error": "Provide exactly one of --tenant or --tenant-id"}
    if tid:
        try:
            tenant_uuid = UUID(tid)
        except ValueError:
            return {"ok": False, "error": "Invalid UUID for --tenant-id"}
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_uuid))
    else:
        if not _SLUG_RE.match(slug or ""):
            return {"ok": False, "error": "Invalid format for --tenant"}
        result = await session.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": "Tenant not found"}

    try:
        max_items = int(params.get("max-items", "200"))
    except ValueError:
        return {"ok": False, "error": "Invalid --max-items"}
    max_items = max(1, min(max_items, 1000))

    counts = await run_stripe_reconcile_for_tenant(
        session, tenant.id, max_items=max_items
    )
    await session.flush()
    return {
        "ok": True,
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        **counts,
    }


register(
    CommandDef(
        domain="subscriptions",
        action="expiring",
        help="Find subscriptions expiring within N days",
        params=[
            ParamDef(
                name="days", long="--days", short="-d",
                help="Look-ahead window in days", default="30",
            ),
        ],
        handler=handle_subscriptions_expiring,
    )
)

register(
    CommandDef(
        domain="subscriptions",
        action="reconcile-stripe",
        help="Reconcile Stripe-backed subscriptions + licenses for a tenant",
        params=[
            ParamDef(
                name="tenant", long="--tenant", short="-t",
                help="Tenant slug", pattern=_SLUG_RE,
            ),
            ParamDef(name="tenant-id", long="--tenant-id", help="Tenant UUID"),
            ParamDef(
                name="max-items", long="--max-items",
                help="Max subscriptions to process (1–1000)", default="200",
            ),
        ],
        handler=handle_subscriptions_reconcile_stripe,
    )
)


# ─── License Handlers ─────────────────────────────────────────────────────────

VALID_LICENSE_STATUSES = ("active", "expired", "revoked", "suspended")


# ── licenses:list ──

async def handle_licenses_list(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    q = (
        select(License, Tenant.slug, Tenant.name)
        .join(Tenant, License.tenant_id == Tenant.id)
        .order_by(License.created_at.desc())
    )

    tenant_slug = params.get("tenant")
    if tenant_slug:
        q = q.where(Tenant.slug == tenant_slug)

    status = params.get("status")
    if status:
        q = q.where(License.status == status)

    result = await session.execute(q)
    rows = result.all()
    items = [
        {
            "id": str(lic.id),
            "tenant_slug": t_slug,
            "tenant_name": t_name,
            "user_id": str(lic.user_id) if lic.user_id else None,
            "subscription_id": str(lic.subscription_id) if lic.subscription_id else None,
            "status": lic.status,
            "valid_from": lic.valid_from.isoformat() if lic.valid_from else None,
            "valid_until": lic.valid_until.isoformat() if lic.valid_until else None,
            "created": lic.created_at.isoformat() if lic.created_at else None,
        }
        for lic, t_slug, t_name in rows
    ]
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="licenses",
        action="list",
        help="List licenses, optionally filtered by tenant or status",
        params=[
            ParamDef(
                name="tenant", long="--tenant", short="-t",
                help="Filter by tenant slug",
            ),
            ParamDef(
                name="status", long="--status", short="-s",
                help="Filter by status",
                allowed=VALID_LICENSE_STATUSES,
            ),
        ],
        handler=handle_licenses_list,
    )
)


# ── licenses:get ──

async def handle_licenses_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    lid = params.get("id")
    if not lid:
        return {"ok": False, "error": "Provide --id"}

    from uuid import UUID
    try:
        lic_uuid = UUID(lid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(License, Tenant.slug, Tenant.name)
        .join(Tenant, License.tenant_id == Tenant.id)
        .where(License.id == lic_uuid)
    )
    row = result.one_or_none()
    if not row:
        return {"ok": False, "error": "License not found"}

    lic, t_slug, t_name = row

    features_result = await session.execute(
        select(LicenseFeature).where(LicenseFeature.license_id == lic.id)
    )
    features = [
        {"key": f.feature_key, "enabled": f.enabled}
        for f in features_result.scalars().all()
    ]

    limits_result = await session.execute(
        select(LicenseLimit).where(LicenseLimit.license_id == lic.id)
    )
    limits = [
        {"key": lm.limit_key, "value": lm.limit_value}
        for lm in limits_result.scalars().all()
    ]

    seats_result = await session.execute(
        select(SeatUsage).where(SeatUsage.license_id == lic.id)
    )
    seats = [
        {
            "type": s.seat_type,
            "current": s.current_count,
            "max": s.max_count,
        }
        for s in seats_result.scalars().all()
    ]

    user_email = None
    if lic.user_id:
        user_result = await session.execute(
            select(User.email).where(User.id == lic.user_id)
        )
        user_email = user_result.scalar_one_or_none()

    return {
        "ok": True,
        "license": {
            "id": str(lic.id),
            "tenant": {"slug": t_slug, "name": t_name},
            "user_email": user_email,
            "subscription_id": str(lic.subscription_id) if lic.subscription_id else None,
            "status": lic.status,
            "valid_from": lic.valid_from.isoformat() if lic.valid_from else None,
            "valid_until": lic.valid_until.isoformat() if lic.valid_until else None,
            "features": features,
            "limits": limits,
            "seats": seats,
            "created": lic.created_at.isoformat() if lic.created_at else None,
        },
    }


register(
    CommandDef(
        domain="licenses",
        action="get",
        help="Get license details with features, limits, and seat usage",
        params=[
            ParamDef(name="id", long="--id", required=True, help="License UUID"),
        ],
        handler=handle_licenses_get,
    )
)


# ── licenses:grant ──

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


async def handle_licenses_grant(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    from datetime import date, datetime, timezone
    from uuid import UUID

    tenant_slug = params["tenant"]
    email = params.get("email")
    valid_from_str = params.get("valid-from")
    valid_until_str = params.get("valid-until")
    subscription_id_str = params.get("subscription-id")

    result = await session.execute(
        select(Tenant).where(Tenant.slug == tenant_slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return {"ok": False, "error": f"Tenant '{tenant_slug}' not found"}

    user_id = None
    if email:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            return {"ok": False, "error": f"User '{email}' not found"}
        user_id = user.id

    subscription_id = None
    if subscription_id_str:
        try:
            subscription_id = UUID(subscription_id_str)
        except ValueError:
            return {"ok": False, "error": "Invalid UUID format for --subscription-id"}

    valid_from = date.today()
    if valid_from_str:
        try:
            valid_from = date.fromisoformat(valid_from_str)
        except ValueError:
            return {"ok": False, "error": "Invalid date format for --valid-from (use YYYY-MM-DD)"}

    valid_until = None
    if valid_until_str:
        try:
            valid_until = date.fromisoformat(valid_until_str)
        except ValueError:
            return {"ok": False, "error": "Invalid date format for --valid-until (use YYYY-MM-DD)"}

    lic = License(
        tenant_id=tenant.id,
        user_id=user_id,
        subscription_id=subscription_id,
        status="active",
        valid_from=valid_from,
        valid_until=valid_until,
    )
    session.add(lic)
    await session.flush()

    return {
        "ok": True,
        "message": f"License granted to tenant '{tenant_slug}'"
        + (f" for user '{email}'" if email else ""),
        "license_id": str(lic.id),
        "changes": {
            "action": "granted",
            "entity": "license",
            "new_state": {
                "id": str(lic.id),
                "tenant_slug": tenant_slug,
                "user_email": email,
                "subscription_id": str(subscription_id) if subscription_id else None,
                "status": "active",
                "valid_from": valid_from.isoformat(),
                "valid_until": valid_until.isoformat() if valid_until else None,
            },
        },
    }


register(
    CommandDef(
        domain="licenses",
        action="grant",
        help="Grant a new license to a tenant (optionally for a specific user)",
        params=[
            ParamDef(
                name="tenant", long="--tenant", short="-t",
                required=True, help="Tenant slug",
            ),
            ParamDef(
                name="email", long="--email", short="-e",
                help="User email (optional)", pattern=_EMAIL_RE,
            ),
            ParamDef(
                name="subscription-id", long="--subscription-id",
                help="Link to subscription UUID",
            ),
            ParamDef(
                name="valid-from", long="--valid-from",
                help="Start date (YYYY-MM-DD, default: today)", pattern=_DATE_RE,
            ),
            ParamDef(
                name="valid-until", long="--valid-until",
                help="End date (YYYY-MM-DD, optional)", pattern=_DATE_RE,
            ),
        ],
        handler=handle_licenses_grant,
    )
)


# ── licenses:revoke ──

async def handle_licenses_revoke(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    from uuid import UUID

    lid = params["id"]
    try:
        lic_uuid = UUID(lid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(License, Tenant.slug)
        .join(Tenant, License.tenant_id == Tenant.id)
        .where(License.id == lic_uuid)
    )
    row = result.one_or_none()
    if not row:
        return {"ok": False, "error": "License not found"}

    lic, tenant_slug = row

    if lic.status == "revoked":
        return {"ok": True, "message": "License is already revoked"}

    previous_status = lic.status
    lic.status = "revoked"
    await session.flush()

    user_email = None
    if lic.user_id:
        ue = await session.execute(select(User.email).where(User.id == lic.user_id))
        user_email = ue.scalar_one_or_none()

    return {
        "ok": True,
        "message": f"License {lid} revoked",
        "changes": {
            "action": "revoked",
            "entity": "license",
            "entity_id": lid,
            "tenant_slug": tenant_slug,
            "user_email": user_email,
            "previous_state": {"status": previous_status},
            "new_state": {"status": "revoked"},
        },
    }


register(
    CommandDef(
        domain="licenses",
        action="revoke",
        help="Revoke an active license",
        params=[
            ParamDef(name="id", long="--id", required=True, help="License UUID"),
        ],
        handler=handle_licenses_revoke,
    )
)


# ── licenses:reinstate ──

async def handle_licenses_reinstate(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    from uuid import UUID

    lid = params["id"]
    try:
        lic_uuid = UUID(lid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(License, Tenant.slug)
        .join(Tenant, License.tenant_id == Tenant.id)
        .where(License.id == lic_uuid)
    )
    row = result.one_or_none()
    if not row:
        return {"ok": False, "error": "License not found"}

    lic, tenant_slug = row

    if lic.status == "active":
        return {"ok": True, "message": "License is already active"}

    previous_status = lic.status
    lic.status = "active"
    await session.flush()

    user_email = None
    if lic.user_id:
        ue = await session.execute(select(User.email).where(User.id == lic.user_id))
        user_email = ue.scalar_one_or_none()

    return {
        "ok": True,
        "message": f"License {lid} reinstated",
        "changes": {
            "action": "reinstated",
            "entity": "license",
            "entity_id": lid,
            "tenant_slug": tenant_slug,
            "user_email": user_email,
            "previous_state": {"status": previous_status},
            "new_state": {"status": "active"},
        },
    }


register(
    CommandDef(
        domain="licenses",
        action="reinstate",
        help="Reinstate a revoked or expired license",
        params=[
            ParamDef(name="id", long="--id", required=True, help="License UUID"),
        ],
        handler=handle_licenses_reinstate,
    )
)


# ─── Audit Log Handlers ──────────────────────────────────────────────────────

from app.platform.models import CommandAuditLog


# ── audit:list ──

async def handle_audit_list(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    q = select(CommandAuditLog).order_by(CommandAuditLog.created_at.desc())

    email = params.get("email")
    if email:
        q = q.where(CommandAuditLog.user_email == email)

    domain = params.get("domain")
    if domain:
        q = q.where(CommandAuditLog.domain == domain)

    action = params.get("action")
    if action:
        q = q.where(CommandAuditLog.action == action)

    status_filter = params.get("status")
    if status_filter:
        q = q.where(CommandAuditLog.status == status_filter)

    limit = min(int(params.get("limit", "50")), 200)
    q = q.limit(limit)

    result = await session.execute(q)
    rows = result.scalars().all()
    items = []
    for r in rows:
        entry: dict = {
            "id": str(r.id),
            "user_email": r.user_email,
            "user_id": str(r.user_id),
            "command": r.command,
            "domain": r.domain,
            "action": r.action,
            "status": r.status,
            "result_summary": r.result_summary,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        if r.result_data and "changes" in r.result_data:
            entry["changes"] = r.result_data["changes"]
        items.append(entry)
    return {"ok": True, "count": len(items), "items": items}


register(
    CommandDef(
        domain="audit",
        action="list",
        help="List command audit log entries",
        params=[
            ParamDef(
                name="email", long="--email", short="-e",
                help="Filter by executor email",
            ),
            ParamDef(
                name="domain", long="--domain", short="-d",
                help="Filter by command domain (users, tenants, plans, ...)",
            ),
            ParamDef(
                name="action", long="--action", short="-a",
                help="Filter by action (create, list, grant, revoke, ...)",
            ),
            ParamDef(
                name="status", long="--status", short="-s",
                help="Filter by status (success, failed)",
                allowed=("success", "failed"),
            ),
            ParamDef(
                name="limit", long="--limit", short="-l",
                help="Max entries to return (1-200)", default="50",
            ),
        ],
        handler=handle_audit_list,
    )
)


# ── audit:get ──

async def handle_audit_get(
    session: AsyncSession, params: dict[str, str]
) -> CommandResult:
    aid = params.get("id")
    if not aid:
        return {"ok": False, "error": "Provide --id"}

    from uuid import UUID
    try:
        audit_uuid = UUID(aid)
    except ValueError:
        return {"ok": False, "error": "Invalid UUID format for --id"}

    result = await session.execute(
        select(CommandAuditLog).where(CommandAuditLog.id == audit_uuid)
    )
    r = result.scalar_one_or_none()
    if not r:
        return {"ok": False, "error": "Audit entry not found"}

    return {
        "ok": True,
        "audit_entry": {
            "id": str(r.id),
            "user_email": r.user_email,
            "user_id": str(r.user_id),
            "command": r.command,
            "domain": r.domain,
            "action": r.action,
            "params": r.params,
            "status": r.status,
            "result_summary": r.result_summary,
            "result_data": r.result_data,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        },
    }


register(
    CommandDef(
        domain="audit",
        action="get",
        help="Get full details of an audit log entry",
        params=[
            ParamDef(name="id", long="--id", required=True, help="Audit entry UUID"),
        ],
        handler=handle_audit_get,
    )
)
