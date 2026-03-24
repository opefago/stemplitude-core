"""User management commands.

Usage:
    python -m app.manage users create-superadmin --email EMAIL --password PASSWORD
    python -m app.manage users create-superadmin --role devops --email EMAIL --password PASSWORD
    python -m app.manage users set-role --email EMAIL --role support
    python -m app.manage users remove-role --email EMAIL
    python -m app.manage users list-admins

Help:
    python -m app.manage users --help
    python -m app.manage users create-superadmin --help
"""

from typing import Annotated

import typer
from sqlalchemy import select

from app.commands._async import async_command
from app.config import settings
from app.core.security import hash_password
from app.database import async_session_factory
from app.roles.models import Role, UserRole
from app.users.models import User

app = typer.Typer(
    no_args_is_help=True,
    rich_markup_mode="rich",
    help=(
        "User and super-admin management.\n\n"
        "Create platform-level super-admin accounts, assign global roles, "
        "and list existing admins.\n\n"
        "[bold]Examples:[/bold]\n\n"
        "  python -m app.manage users create-superadmin --email admin@stemplitude.com -p S3cureP@ssw0rd!\n"
        "  python -m app.manage users create-superadmin --role devops -e ops@co.com -p S3cureP@ssw0rd!\n"
        "  python -m app.manage users set-role --email ops@co.com --role support\n"
        "  python -m app.manage users list-admins"
    ),
)

MIN_PASSWORD_LENGTH = 12

VALID_GLOBAL_ROLES = (
    "platform_owner",
    "platform_admin",
    "devops",
    "support",
    "platform_finance",
    "growth_ops",
)


async def _resolve_global_role(session, slug: str) -> Role | None:
    """Look up a global (tenant_id IS NULL) role by slug."""
    result = await session.execute(
        select(Role).where(
            Role.slug == slug,
            Role.tenant_id.is_(None),
            Role.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def _assign_global_role(session, user: User, role: Role, granted_by: User | None = None) -> None:
    """Assign a global role to a user, replacing any existing one."""
    existing = await session.execute(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.is_active == True)
    )
    for ur in existing.scalars().all():
        ur.is_active = False

    session.add(UserRole(
        user_id=user.id,
        role_id=role.id,
        is_active=True,
        granted_by=granted_by.id if granted_by else None,
    ))

    if not user.is_super_admin:
        user.is_super_admin = True


@app.command()
@async_command
async def create_superadmin(
    email: Annotated[
        str | None,
        typer.Option(
            "--email", "-e",
            help="Super admin email. Falls back to SUPERADMIN_EMAIL env var.",
            envvar="SUPERADMIN_EMAIL",
        ),
    ] = None,
    password: Annotated[
        str | None,
        typer.Option(
            "--password", "-p",
            help="Super admin password (min 12 chars). Falls back to SUPERADMIN_PASSWORD env var.",
            envvar="SUPERADMIN_PASSWORD",
            hide_input=True,
        ),
    ] = None,
    first_name: Annotated[
        str,
        typer.Option("--first-name", help="First name."),
    ] = "System",
    last_name: Annotated[
        str,
        typer.Option("--last-name", help="Last name."),
    ] = "Admin",
    role_slug: Annotated[
        str,
        typer.Option(
            "--role", "-r",
            help=f"Global role to assign. One of: {', '.join(VALID_GLOBAL_ROLES)}",
        ),
    ] = "platform_owner",
) -> None:
    """Create a new super-admin account, or promote an existing user.

    Idempotent — if the user already has a global role, it is updated
    to the requested role. If the user exists but has no global role,
    they are assigned one.

    [bold]Examples:[/bold]

        python -m app.manage users create-superadmin --email admin@stemplitude.com -p S3cureP@ssw0rd!
        python -m app.manage users create-superadmin --role devops -e ops@co.com -p Secret12345!
    """
    resolved_email = email or settings.SUPERADMIN_EMAIL
    resolved_password = password or settings.SUPERADMIN_PASSWORD

    if not resolved_email or not resolved_password:
        typer.echo(
            "Error: --email and --password are required "
            "(or set SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars).",
            err=True,
        )
        raise typer.Exit(code=1)

    if len(resolved_password) < MIN_PASSWORD_LENGTH:
        typer.echo(
            f"Error: password must be at least {MIN_PASSWORD_LENGTH} characters.",
            err=True,
        )
        raise typer.Exit(code=1)

    if role_slug not in VALID_GLOBAL_ROLES:
        typer.echo(
            f"Error: --role must be one of: {', '.join(VALID_GLOBAL_ROLES)}",
            err=True,
        )
        raise typer.Exit(code=1)

    async with async_session_factory() as session:
        global_role = await _resolve_global_role(session, role_slug)
        if not global_role:
            typer.echo(
                f"Error: global role '{role_slug}' not found. Run the migration first.",
                err=True,
            )
            raise typer.Exit(code=1)

        result = await session.execute(
            select(User).where(User.email == resolved_email)
        )
        existing = result.scalar_one_or_none()

        if existing:
            await _assign_global_role(session, existing, global_role)
            await session.commit()
            typer.echo(f"User '{resolved_email}' assigned global role '{role_slug}'.")
            return

        user = User(
            email=resolved_email,
            password_hash=hash_password(resolved_password),
            first_name=first_name,
            last_name=last_name,
            is_super_admin=True,
            is_active=True,
        )
        session.add(user)
        await session.flush()

        await _assign_global_role(session, user, global_role)
        await session.commit()
        typer.echo(f"Super admin '{resolved_email}' created with role '{role_slug}'.")


@app.command("set-role")
@async_command
async def set_role(
    email: Annotated[
        str,
        typer.Option("--email", "-e", help="User email address."),
    ],
    role_slug: Annotated[
        str,
        typer.Option(
            "--role", "-r",
            help=f"Global role slug. One of: {', '.join(VALID_GLOBAL_ROLES)}",
        ),
    ],
) -> None:
    """Assign or change a user's global (platform) role.

    [bold]Examples:[/bold]

        python -m app.manage users set-role --email ops@co.com --role devops
        python -m app.manage users set-role -e support@co.com -r support
    """
    if role_slug not in VALID_GLOBAL_ROLES:
        typer.echo(
            f"Error: --role must be one of: {', '.join(VALID_GLOBAL_ROLES)}",
            err=True,
        )
        raise typer.Exit(code=1)

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        if not user:
            typer.echo(f"Error: user '{email}' not found.", err=True)
            raise typer.Exit(code=1)

        global_role = await _resolve_global_role(session, role_slug)
        if not global_role:
            typer.echo(f"Error: global role '{role_slug}' not found.", err=True)
            raise typer.Exit(code=1)

        await _assign_global_role(session, user, global_role)
        await session.commit()
        typer.echo(f"User '{email}' assigned global role '{role_slug}'.")


@app.command("remove-role")
@async_command
async def remove_role(
    email: Annotated[
        str,
        typer.Option("--email", "-e", help="User email address."),
    ],
) -> None:
    """Remove a user's global (platform) role.

    [bold]Example:[/bold]

        python -m app.manage users remove-role --email ops@co.com
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        if not user:
            typer.echo(f"Error: user '{email}' not found.", err=True)
            raise typer.Exit(code=1)

        existing = await session.execute(
            select(UserRole).where(
                UserRole.user_id == user.id, UserRole.is_active == True
            )
        )
        count = 0
        for ur in existing.scalars().all():
            ur.is_active = False
            count += 1

        if count == 0:
            typer.echo(f"User '{email}' has no active global role.")
            return

        user.is_super_admin = False
        await session.commit()
        typer.echo(f"Removed global role from '{email}' ({count} deactivated).")


@app.command("list-admins")
@async_command
async def list_admins() -> None:
    """List all users with global (platform) roles.

    [bold]Example:[/bold]

        python -m app.manage users list-admins
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(User, Role)
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, UserRole.role_id == Role.id)
            .where(UserRole.is_active == True, Role.tenant_id.is_(None))
            .order_by(User.created_at)
        )
        rows = result.all()

    if not rows:
        typer.echo("No users with global roles found.")
        return

    typer.echo(f"{'Email':<40} {'Name':<25} {'Role':<20} {'Active':<8} {'Created'}")
    typer.echo("-" * 115)
    for user, role in rows:
        typer.echo(
            f"{user.email:<40} {user.first_name} {user.last_name:<19} "
            f"{role.slug:<20} {'yes' if user.is_active else 'no':<8} "
            f"{user.created_at:%Y-%m-%d %H:%M}"
        )
