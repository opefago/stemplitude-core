"""Tenant management commands.

Usage:
    python -m app.manage tenants create --name "Robotics Academy" --slug robotics-academy --code ROBO2024
    python -m app.manage tenants create --name "Home STEM" --slug home-stem --code HOME01 --type parent --owner admin@stemplitude.com
    python -m app.manage tenants list
    python -m app.manage tenants get --slug robotics-academy
    python -m app.manage tenants deactivate --slug robotics-academy
    python -m app.manage tenants activate --slug robotics-academy
    python -m app.manage tenants add-member --slug robotics-academy --email user@example.com --role instructor
    python -m app.manage tenants create-role --slug robotics-academy --role-name "Teaching Assistant" --role-slug ta
    python -m app.manage tenants set-role --slug robotics-academy --email user@example.com --role instructor
    python -m app.manage tenants list-roles --slug robotics-academy
    python -m app.manage tenants show-role --slug robotics-academy --role-slug instructor
    python -m app.manage tenants add-role-permissions --slug robotics-academy --role-slug ta --permission students:view
    python -m app.manage tenants permissions-catalog

Help:
    python -m app.manage tenants --help
    python -m app.manage tenants create --help
"""

import json
from typing import Annotated
from uuid import UUID

import typer
from sqlalchemy import func, select

from app.commands._async import async_command
from app.database import async_session_factory
from app.roles.models import Permission, Role, RolePermission
from app.roles.repository import RoleRepository
from app.tenants.models import Membership, Tenant
from app.users.models import User

app = typer.Typer(
    no_args_is_help=True,
    rich_markup_mode="rich",
    help=(
        "Tenant (organization) management.\n\n"
        "Create and manage tenants, control memberships, and define custom roles. "
        "Each tenant is an isolated organization with its own members, roles, and settings.\n\n"
        "[bold]Lifecycle:[/bold]  create → get / list → deactivate / activate\n"
        "[bold]Members:[/bold]    add-member → set-role\n"
        "[bold]Roles:[/bold]      create-role, list-roles, show-role, add-role-permissions, remove-role-permissions, permissions-catalog\n\n"
        "[bold]Examples:[/bold]\n\n"
        '  python -m app.manage tenants create --name "Robotics Academy" --slug robotics-academy --code ROBO2024\n'
        "  python -m app.manage tenants add-member -s robotics-academy -e user@example.com -r instructor\n"
        '  python -m app.manage tenants create-role -s robotics-academy --role-name "Teaching Assistant" --role-slug ta --template instructor\n'
        "  python -m app.manage tenants set-role -s robotics-academy -e user@example.com -r ta\n"
        "  python -m app.manage tenants list --active-only"
    ),
)

DEFAULT_ROLES = [
    ("admin", "Administrator"),
    ("instructor", "Instructor"),
    ("student", "Student"),
]


async def _resolve_tenant(
    session,
    *,
    slug: str | None,
    tenant_id: str | None,
) -> Tenant:
    """Resolve a tenant by exactly one of slug or tenant UUID string."""
    if (slug is None) == (tenant_id is None):
        typer.echo("Error: provide exactly one of --slug (-s) or --tenant-id.", err=True)
        raise typer.Exit(code=1)
    if tenant_id is not None:
        try:
            tid = UUID(tenant_id)
        except ValueError:
            typer.echo("Error: --tenant-id must be a valid UUID.", err=True)
            raise typer.Exit(code=1)
        result = await session.execute(select(Tenant).where(Tenant.id == tid))
    else:
        result = await session.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if not tenant:
        typer.echo("Error: tenant not found.", err=True)
        raise typer.Exit(code=1)
    return tenant


def _merge_permission_cli_keys(
    permission: list[str] | None,
    permissions_csv: str | None,
) -> list[str]:
    keys: list[str] = []
    if permission:
        keys.extend(permission)
    if permissions_csv:
        keys.extend(p.strip() for p in permissions_csv.split(",") if p.strip())
    return keys


async def _permissions_by_keys(repo: RoleRepository, keys: list[str]) -> list[Permission]:
    """Resolve resource:action strings to Permission rows (deduplicated, stable order)."""
    out: list[Permission] = []
    seen: set[UUID] = set()
    for raw in keys:
        raw = raw.strip()
        if not raw:
            continue
        if ":" not in raw:
            typer.echo(f"Error: permission '{raw}' must be resource:action", err=True)
            raise typer.Exit(code=1)
        resource, action = raw.split(":", 1)
        resource, action = resource.strip(), action.strip()
        perm = await repo.get_permission_by_resource_action(resource, action)
        if not perm:
            typer.echo(
                "Error: unknown permission "
                f"'{raw}'. Use 'python -m app.manage tenants permissions-catalog'.",
                err=True,
            )
            raise typer.Exit(code=1)
        if perm.id not in seen:
            seen.add(perm.id)
            out.append(perm)
    return out


@app.command()
@async_command
async def create(
    name: Annotated[str, typer.Option("--name", "-n", help="Tenant display name.")],
    slug: Annotated[str, typer.Option("--slug", "-s", help="URL-safe identifier (subdomain).")],
    code: Annotated[str, typer.Option("--code", "-c", help="Short student login code (4-20 chars).")],
    type: Annotated[str, typer.Option("--type", "-t", help="Tenant type: center or parent.")] = "center",
    owner_email: Annotated[
        str | None,
        typer.Option("--owner", "-o", help="Email of user to assign as admin (must already exist)."),
    ] = None,
    settings_json: Annotated[
        str | None,
        typer.Option("--settings", help="Tenant settings as JSON string."),
    ] = None,
) -> None:
    """Create a new tenant organization with default roles.

    Provisions a tenant with three system roles ([bold]admin[/bold],
    [bold]instructor[/bold], [bold]student[/bold]). Optionally assigns an
    existing user as the tenant admin via [bold]--owner[/bold].

    The [bold]--code[/bold] is a short alphanumeric string students use to join;
    it is stored uppercase.

    [bold]Examples:[/bold]

        python -m app.manage tenants create --name "Robotics Academy" --slug robotics-academy --code ROBO2024
        python -m app.manage tenants create -n "Home STEM" -s home-stem -c HOME01 --type parent --owner admin@stemplitude.com
        python -m app.manage tenants create -n "Lab" -s lab -c LAB01 --settings '{"max_students": 30}'
    """
    code = code.upper()

    parsed_settings: dict = {}
    if settings_json:
        try:
            parsed_settings = json.loads(settings_json)
        except json.JSONDecodeError:
            typer.echo("Error: --settings must be valid JSON.", err=True)
            raise typer.Exit(code=1)

    async with async_session_factory() as session:
        existing = await session.execute(
            select(Tenant).where((Tenant.slug == slug) | (Tenant.code == code))
        )
        if existing.scalar_one_or_none():
            typer.echo(f"Error: tenant with slug '{slug}' or code '{code}' already exists.", err=True)
            raise typer.Exit(code=1)

        owner: User | None = None
        if owner_email:
            result = await session.execute(
                select(User).where(User.email == owner_email)
            )
            owner = result.scalar_one_or_none()
            if not owner:
                typer.echo(f"Error: user '{owner_email}' not found. Create the user first.", err=True)
                raise typer.Exit(code=1)

        tenant = Tenant(
            name=name,
            slug=slug,
            code=code,
            type=type,
            settings=parsed_settings,
            is_active=True,
        )
        session.add(tenant)
        await session.flush()

        for role_slug, role_name in DEFAULT_ROLES:
            session.add(Role(
                tenant_id=tenant.id,
                name=role_name,
                slug=role_slug,
                is_system=True,
            ))
        await session.flush()

        if owner:
            admin_role_result = await session.execute(
                select(Role).where(Role.tenant_id == tenant.id, Role.slug == "admin")
            )
            admin_role = admin_role_result.scalar_one_or_none()
            session.add(Membership(
                user_id=owner.id,
                tenant_id=tenant.id,
                role_id=admin_role.id if admin_role else None,
                is_active=True,
            ))

        await session.commit()

        typer.echo(f"Tenant created:")
        typer.echo(f"  ID:   {tenant.id}")
        typer.echo(f"  Name: {tenant.name}")
        typer.echo(f"  Slug: {tenant.slug}")
        typer.echo(f"  Code: {tenant.code}")
        typer.echo(f"  Type: {tenant.type}")
        if owner:
            typer.echo(f"  Owner: {owner.email} (admin)")


@app.command("list")
@async_command
async def list_tenants(
    active_only: Annotated[
        bool, typer.Option("--active-only", help="Only show active tenants.")
    ] = False,
) -> None:
    """List all tenants in a table.

    Shows name, slug, code, type, active status, and creation date.
    Use [bold]--active-only[/bold] to hide deactivated tenants.

    [bold]Examples:[/bold]

        python -m app.manage tenants list
        python -m app.manage tenants list --active-only
    """
    async with async_session_factory() as session:
        query = select(Tenant).order_by(Tenant.created_at)
        if active_only:
            query = query.where(Tenant.is_active == True)
        result = await session.execute(query)
        tenants = result.scalars().all()

    if not tenants:
        typer.echo("No tenants found.")
        return

    typer.echo(f"{'Name':<30} {'Slug':<25} {'Code':<12} {'Type':<10} {'Active':<8} {'Created'}")
    typer.echo("-" * 110)
    for t in tenants:
        typer.echo(
            f"{t.name:<30} {t.slug:<25} {t.code:<12} {t.type:<10} "
            f"{'yes' if t.is_active else 'no':<8} {t.created_at:%Y-%m-%d %H:%M}"
        )


@app.command()
@async_command
async def get(
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    code: Annotated[str | None, typer.Option("--code", "-c", help="Tenant code.")] = None,
    id: Annotated[str | None, typer.Option("--id", help="Tenant UUID.")] = None,
) -> None:
    """Get detailed info for a single tenant.

    Look up a tenant by [bold]--slug[/bold], [bold]--code[/bold], or
    [bold]--id[/bold] (at least one is required). Displays full details
    including member count, settings JSON, and timestamps.

    [bold]Examples:[/bold]

        python -m app.manage tenants get --slug robotics-academy
        python -m app.manage tenants get --code ROBO2024
        python -m app.manage tenants get --id 550e8400-e29b-41d4-a716-446655440000
    """
    if not slug and not code and not id:
        typer.echo("Error: provide --slug, --code, or --id.", err=True)
        raise typer.Exit(code=1)

    async with async_session_factory() as session:
        query = select(Tenant)
        if id:
            query = query.where(Tenant.id == id)
        elif slug:
            query = query.where(Tenant.slug == slug)
        else:
            query = query.where(Tenant.code == code.upper())

        result = await session.execute(query)
        tenant = result.scalar_one_or_none()

        if not tenant:
            typer.echo("Tenant not found.", err=True)
            raise typer.Exit(code=1)

        member_count = await session.execute(
            select(func.count(Membership.id)).where(
                Membership.tenant_id == tenant.id,
                Membership.is_active == True,
            )
        )

        typer.echo(f"ID:       {tenant.id}")
        typer.echo(f"Name:     {tenant.name}")
        typer.echo(f"Slug:     {tenant.slug}")
        typer.echo(f"Code:     {tenant.code}")
        typer.echo(f"Type:     {tenant.type}")
        typer.echo(f"Active:   {tenant.is_active}")
        typer.echo(f"Members:  {member_count.scalar() or 0}")
        typer.echo(f"Settings: {json.dumps(tenant.settings or {}, indent=2)}")
        typer.echo(f"Created:  {tenant.created_at:%Y-%m-%d %H:%M:%S %Z}")
        typer.echo(f"Updated:  {tenant.updated_at:%Y-%m-%d %H:%M:%S %Z}")


@app.command()
@async_command
async def deactivate(
    slug: Annotated[str, typer.Option("--slug", "-s", help="Tenant slug to deactivate.")],
) -> None:
    """Soft-deactivate a tenant (does not delete data).

    Sets the tenant's active flag to false. Members and data are preserved
    and the tenant can be re-activated later with the [bold]activate[/bold] command.

    [bold]Example:[/bold]

        python -m app.manage tenants deactivate --slug robotics-academy
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(Tenant).where(Tenant.slug == slug)
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            typer.echo(f"Tenant '{slug}' not found.", err=True)
            raise typer.Exit(code=1)

        if not tenant.is_active:
            typer.echo(f"Tenant '{slug}' is already inactive.")
            return

        tenant.is_active = False
        await session.commit()
        typer.echo(f"Tenant '{slug}' deactivated.")


@app.command()
@async_command
async def activate(
    slug: Annotated[str, typer.Option("--slug", "-s", help="Tenant slug to activate.")],
) -> None:
    """Re-activate a previously deactivated tenant.

    Restores the tenant's active flag so members can access it again.

    [bold]Example:[/bold]

        python -m app.manage tenants activate --slug robotics-academy
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(Tenant).where(Tenant.slug == slug)
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            typer.echo(f"Tenant '{slug}' not found.", err=True)
            raise typer.Exit(code=1)

        if tenant.is_active:
            typer.echo(f"Tenant '{slug}' is already active.")
            return

        tenant.is_active = True
        await session.commit()
        typer.echo(f"Tenant '{slug}' activated.")


@app.command("add-member")
@async_command
async def add_member(
    email: Annotated[str, typer.Option("--email", "-e", help="Email of the user to add.")],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
    role: Annotated[
        str | None,
        typer.Option("--role", "-r", help="Role slug to assign (e.g. admin, instructor, student)."),
    ] = None,
) -> None:
    """Add an existing user to a tenant as a member.

    The user must already exist in the users table (create them first via the
    API or the [bold]users[/bold] command group). Each user can only be a member
    of a given tenant once.

    Optionally assign a role at the same time with [bold]--role[/bold]. The role
    must already exist on the tenant (the 3 system roles — admin, instructor,
    student — are created automatically with the tenant).

    [bold]Examples:[/bold]

        python -m app.manage tenants add-member -s robotics-academy -e user@example.com -r instructor
        python -m app.manage tenants add-member --slug home-stem --email parent@example.com   [dim]# no role[/dim]
    """
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        label = tenant.slug

        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if not user:
            typer.echo(f"Error: user '{email}' not found.", err=True)
            raise typer.Exit(code=1)

        existing = (
            await session.execute(
                select(Membership).where(
                    Membership.user_id == user.id,
                    Membership.tenant_id == tenant.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            typer.echo(f"Error: user '{email}' is already a member of '{label}'.", err=True)
            raise typer.Exit(code=1)

        role_obj: Role | None = None
        if role:
            role_obj = (
                await session.execute(
                    select(Role).where(Role.tenant_id == tenant.id, Role.slug == role)
                )
            ).scalar_one_or_none()
            if not role_obj:
                typer.echo(f"Error: role '{role}' not found on tenant '{label}'.", err=True)
                raise typer.Exit(code=1)

        membership = Membership(
            user_id=user.id,
            tenant_id=tenant.id,
            role_id=role_obj.id if role_obj else None,
            is_active=True,
        )
        session.add(membership)
        await session.commit()

        role_label = role_obj.name if role_obj else "no role"
        typer.echo(f"Added '{email}' to '{label}' with role: {role_label}.")


@app.command("create-role")
@async_command
async def create_role(
    role_name: Annotated[str, typer.Option("--role-name", help="Display name for the role.")],
    role_slug: Annotated[str, typer.Option("--role-slug", help="URL-safe identifier for the role.")],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
    system: Annotated[bool, typer.Option("--system", help="Mark as a system role.")] = False,
    template: Annotated[
        str | None,
        typer.Option(
            "--template",
            "-t",
            help="Copy all permissions from this existing role slug on the tenant.",
        ),
    ] = None,
    permission: Annotated[
        list[str] | None,
        typer.Option(
            "--permission",
            "-p",
            help="Grant permission as resource:action (repeatable). Merged with --template.",
        ),
    ] = None,
    permissions_csv: Annotated[
        str | None,
        typer.Option(
            "--permissions",
            help="Comma-separated resource:action list (merged with --permission and --template).",
        ),
    ] = None,
) -> None:
    """Create a custom role on a tenant.

    Every tenant starts with 3 system roles (admin, instructor, student).
    Use this command to add additional roles like "teaching-assistant" or
    "parent-observer". The [bold]--role-slug[/bold] must be unique within
    the tenant.

    Use [bold]--template[/bold] to copy permissions from an existing role, and/or
    [bold]--permission[/bold] / [bold]--permissions[/bold] to add more.

    [bold]Examples:[/bold]

        python -m app.manage tenants create-role -s robotics-academy --role-name "Teaching Assistant" --role-slug ta
        python -m app.manage tenants create-role --tenant-id <uuid> --role-name TA --role-slug ta --template instructor
        python -m app.manage tenants create-role -s robotics-academy --role-name "Observer" --role-slug observer --system
    """
    keys = _merge_permission_cli_keys(permission, permissions_csv)
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        label = tenant.slug
        repo = RoleRepository(session)

        existing = (
            await session.execute(
                select(Role).where(Role.tenant_id == tenant.id, Role.slug == role_slug)
            )
        ).scalar_one_or_none()
        if existing:
            typer.echo(f"Error: role '{role_slug}' already exists on tenant '{label}'.", err=True)
            raise typer.Exit(code=1)

        new_role = Role(
            tenant_id=tenant.id,
            name=role_name,
            slug=role_slug,
            is_system=system,
        )
        session.add(new_role)
        await session.flush()

        perm_ids: set[UUID] = set()
        if template:
            template_role = await repo.get_role_by_slug(tenant.id, template)
            if not template_role:
                typer.echo(
                    f"Error: template role '{template}' not found on tenant '{label}'.",
                    err=True,
                )
                raise typer.Exit(code=1)
            perm_ids |= await repo.get_role_permission_ids(template_role.id)
        if keys:
            resolved = await _permissions_by_keys(repo, keys)
            perm_ids |= {p.id for p in resolved}

        for pid in perm_ids:
            session.add(RolePermission(role_id=new_role.id, permission_id=pid))
        await session.commit()

        typer.echo(f"Role created on '{label}':")
        typer.echo(f"  ID:     {new_role.id}")
        typer.echo(f"  Name:   {new_role.name}")
        typer.echo(f"  Slug:   {new_role.slug}")
        typer.echo(f"  System: {new_role.is_system}")
        typer.echo(f"  Permissions granted: {len(perm_ids)}")


@app.command("list-roles")
@async_command
async def list_roles_cmd(
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
) -> None:
    """List roles on a tenant with permission counts.

    [bold]Examples:[/bold]

        python -m app.manage tenants list-roles -s robotics-academy
        python -m app.manage tenants list-roles --tenant-id 550e8400-e29b-41d4-a716-446655440000
    """
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        repo = RoleRepository(session)
        roles = await repo.list_roles(tenant.id, include_inactive=True)
        if not roles:
            typer.echo(f"No roles on tenant '{tenant.slug}'.")
            return

        typer.echo(f"Tenant: {tenant.slug} ({tenant.id})\n")
        typer.echo(f"{'Slug':<22} {'Name':<28} {'Sys':<5} {'Act':<5} {'Perms':<6}")
        typer.echo("-" * 75)
        for r in roles:
            n = len(await repo.get_role_permission_ids(r.id))
            typer.echo(
                f"{r.slug:<22} {r.name:<28} "
                f"{'yes' if r.is_system else 'no':<5} "
                f"{'yes' if r.is_active else 'no':<5} "
                f"{n:<6}"
            )


@app.command("show-role")
@async_command
async def show_role(
    role_slug: Annotated[
        str,
        typer.Option("--role-slug", "-r", help="Role slug on the tenant."),
    ],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
) -> None:
    """Show one role and its permissions (resource:action).

    [bold]Examples:[/bold]

        python -m app.manage tenants show-role -s robotics-academy -r instructor
    """
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        repo = RoleRepository(session)
        role = await repo.get_role_by_slug(tenant.id, role_slug)
        if not role:
            typer.echo(
                f"Error: role '{role_slug}' not found on tenant '{tenant.slug}'.",
                err=True,
            )
            raise typer.Exit(code=1)
        perms = await repo.get_role_permissions(role.id)
    perms_sorted = sorted(perms, key=lambda p: (p.resource, p.action))
    typer.echo(f"Tenant:  {tenant.slug} ({tenant.id})")
    typer.echo(f"Role:    {role.name} ({role.slug})")
    typer.echo(f"ID:      {role.id}")
    typer.echo(f"System:  {role.is_system}")
    typer.echo(f"Active:  {role.is_active}")
    typer.echo(f"Permissions ({len(perms_sorted)}):")
    for p in perms_sorted:
        typer.echo(f"  {p.resource}:{p.action}")


@app.command("add-role-permissions")
@async_command
async def add_role_permissions(
    role_slug: Annotated[
        str,
        typer.Option("--role-slug", "-r", help="Role slug on the tenant."),
    ],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
    permission: Annotated[
        list[str] | None,
        typer.Option(
            "--permission",
            "-p",
            help="Permission as resource:action (repeatable).",
        ),
    ] = None,
    permissions_csv: Annotated[
        str | None,
        typer.Option(
            "--permissions",
            help="Comma-separated resource:action list.",
        ),
    ] = None,
    allow_system: Annotated[
        bool,
        typer.Option(
            "--allow-system",
            help="Allow modifying system roles (admin, instructor, student).",
        ),
    ] = False,
) -> None:
    """Add permissions to an existing tenant role (non-system by default).

    The API blocks editing system roles; this CLI matches unless you pass
    [bold]--allow-system[/bold].

    [bold]Examples:[/bold]

        python -m app.manage tenants add-role-permissions -s robotics-academy -r ta -p students:view
        python -m app.manage tenants add-role-permissions -s robotics-academy -r admin --permissions "labs:view,labs:edit" --allow-system
    """
    keys = _merge_permission_cli_keys(permission, permissions_csv)
    if not keys:
        typer.echo("Error: provide --permission and/or --permissions.", err=True)
        raise typer.Exit(code=1)
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        repo = RoleRepository(session)
        role = await repo.get_role_by_slug(tenant.id, role_slug)
        if not role:
            typer.echo(
                f"Error: role '{role_slug}' not found on tenant '{tenant.slug}'.",
                err=True,
            )
            raise typer.Exit(code=1)
        if role.is_system and not allow_system:
            typer.echo(
                "Error: cannot modify permissions of system roles (use --allow-system).",
                err=True,
            )
            raise typer.Exit(code=1)
        to_add = await _permissions_by_keys(repo, keys)
        existing = await repo.get_role_permission_ids(role.id)
        added = 0
        for perm in to_add:
            if perm.id in existing:
                continue
            await repo.add_role_permission(role.id, perm.id)
            added += 1
        await session.commit()
    typer.echo(f"Added {added} permission(s) to role '{role_slug}' on '{tenant.slug}'.")


@app.command("remove-role-permissions")
@async_command
async def remove_role_permissions(
    role_slug: Annotated[
        str,
        typer.Option("--role-slug", "-r", help="Role slug on the tenant."),
    ],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
    permission: Annotated[
        list[str] | None,
        typer.Option(
            "--permission",
            "-p",
            help="Permission as resource:action (repeatable).",
        ),
    ] = None,
    permissions_csv: Annotated[
        str | None,
        typer.Option(
            "--permissions",
            help="Comma-separated resource:action list.",
        ),
    ] = None,
    allow_system: Annotated[
        bool,
        typer.Option(
            "--allow-system",
            help="Allow modifying system roles (admin, instructor, student).",
        ),
    ] = False,
) -> None:
    """Remove permissions from an existing tenant role (non-system by default).

    [bold]Examples:[/bold]

        python -m app.manage tenants remove-role-permissions -s robotics-academy -r ta -p students:delete
    """
    keys = _merge_permission_cli_keys(permission, permissions_csv)
    if not keys:
        typer.echo("Error: provide --permission and/or --permissions.", err=True)
        raise typer.Exit(code=1)
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)
        repo = RoleRepository(session)
        role = await repo.get_role_by_slug(tenant.id, role_slug)
        if not role:
            typer.echo(
                f"Error: role '{role_slug}' not found on tenant '{tenant.slug}'.",
                err=True,
            )
            raise typer.Exit(code=1)
        if role.is_system and not allow_system:
            typer.echo(
                "Error: cannot modify permissions of system roles (use --allow-system).",
                err=True,
            )
            raise typer.Exit(code=1)
        to_remove = await _permissions_by_keys(repo, keys)
        removed = 0
        for perm in to_remove:
            if await repo.remove_role_permission(role.id, perm.id):
                removed += 1
        await session.commit()
    typer.echo(f"Removed {removed} permission(s) from role '{role_slug}' on '{tenant.slug}'.")


@app.command("permissions-catalog")
@async_command
async def permissions_catalog() -> None:
    """List all platform permissions (resource:action) from the database.

    Use these keys with [bold]--permission[/bold], [bold]--permissions[/bold], and [bold]create-role[/bold].
    """
    async with async_session_factory() as session:
        repo = RoleRepository(session)
        perms = await repo.list_permissions()
    for p in perms:
        desc = f"  # {p.description}" if p.description else ""
        typer.echo(f"{p.resource}:{p.action}{desc}")


@app.command("set-role")
@async_command
async def set_role(
    email: Annotated[str, typer.Option("--email", "-e", help="Email of the member.")],
    slug: Annotated[str | None, typer.Option("--slug", "-s", help="Tenant slug.")] = None,
    tenant_id: Annotated[
        str | None,
        typer.Option("--tenant-id", help="Tenant UUID (alternative to --slug)."),
    ] = None,
    role: Annotated[
        str | None,
        typer.Option("--role", "-r", help="Role slug to assign. Omit to clear the role."),
    ] = None,
) -> None:
    """Set or change the role for an existing member on a tenant.

    The user must already be a member of the tenant (use [bold]add-member[/bold]
    first). Pass [bold]--role[/bold] with a role slug to assign it, or omit
    [bold]--role[/bold] to clear the member's current role.

    [bold]Examples:[/bold]

        python -m app.manage tenants set-role -s robotics-academy -e user@example.com -r admin
        python -m app.manage tenants set-role -s robotics-academy -e user@example.com -r ta
        python -m app.manage tenants set-role -s robotics-academy -e user@example.com  [dim]# clears role[/dim]
    """
    async with async_session_factory() as session:
        tenant = await _resolve_tenant(session, slug=slug, tenant_id=tenant_id)

        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if not user:
            typer.echo(f"Error: user '{email}' not found.", err=True)
            raise typer.Exit(code=1)

        membership = (
            await session.execute(
                select(Membership).where(
                    Membership.user_id == user.id,
                    Membership.tenant_id == tenant.id,
                )
            )
        ).scalar_one_or_none()
        if not membership:
            typer.echo(f"Error: user '{email}' is not a member of '{tenant.slug}'.", err=True)
            raise typer.Exit(code=1)

        if role:
            role_obj = (
                await session.execute(
                    select(Role).where(Role.tenant_id == tenant.id, Role.slug == role)
                )
            ).scalar_one_or_none()
            if not role_obj:
                typer.echo(f"Error: role '{role}' not found on tenant '{tenant.slug}'.", err=True)
                raise typer.Exit(code=1)
            membership.role_id = role_obj.id
            await session.commit()
            typer.echo(f"Set role for '{email}' on '{tenant.slug}' to: {role_obj.name}.")
        else:
            membership.role_id = None
            await session.commit()
            typer.echo(f"Cleared role for '{email}' on '{tenant.slug}'.")
