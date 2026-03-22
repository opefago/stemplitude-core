"""Database management commands.

Usage:
    python -m app.manage db seed
    python -m app.manage db migrate
    python -m app.manage db migrate --revision abc123
    python -m app.manage db downgrade --revision -1
    python -m app.manage db current
    python -m app.manage db history

Help:
    python -m app.manage db --help
    python -m app.manage db seed --help
"""

import subprocess
import sys
from typing import Annotated

import typer

from app.commands._async import async_command

app = typer.Typer(
    no_args_is_help=True,
    rich_markup_mode="rich",
    help=(
        "Database migrations and seed data.\n\n"
        "Wraps Alembic for schema migrations and provides a seed command "
        "to populate reference data (plans, permissions, capabilities, email providers).\n\n"
        "[bold]Examples:[/bold]\n\n"
        "  python -m app.manage db seed\n"
        "  python -m app.manage db migrate\n"
        "  python -m app.manage db migrate --revision abc123\n"
        "  python -m app.manage db downgrade --revision -1\n"
        "  python -m app.manage db current"
    ),
)


@app.command()
@async_command
async def seed() -> None:
    """Populate reference data (plans, permissions, capabilities, email providers).

    Idempotent — safe to run multiple times. Existing rows are skipped or
    updated where applicable.

    [bold]Example:[/bold]

        python -m app.manage db seed
    """
    from app.seeds import seed_all

    await seed_all()


@app.command(name="seed-role-perms")
@async_command
async def seed_role_perms() -> None:
    """Backfill permissions for all existing system roles across every tenant.

    Idempotent — already-assigned permissions are skipped. Run this once after
    deploying to populate role_permissions for tenants created before this fix.

    [bold]Example:[/bold]

        python -m app.manage db seed-role-perms
    """
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.roles.defaults import DEFAULT_ROLES as ROLE_PERMISSION_MAP
    from app.roles.models import Permission, Role, RolePermission

    async with async_session_factory() as db:
        # Load global permission catalogue
        perm_result = await db.execute(select(Permission))
        perms_by_key: dict[str, Permission] = {
            f"{p.resource}:{p.action}": p for p in perm_result.scalars().all()
        }

        # Load all system roles
        roles_result = await db.execute(select(Role).where(Role.is_system == True))
        system_roles = roles_result.scalars().all()

        # Load already-assigned pairs to skip
        existing_result = await db.execute(select(RolePermission))
        existing_pairs: set[tuple] = {
            (rp.role_id, rp.permission_id) for rp in existing_result.scalars().all()
        }

        added = 0
        for role in system_roles:
            perm_keys: list[str] = ROLE_PERMISSION_MAP.get(role.slug, {}).get("permissions", [])
            for key in perm_keys:
                perm = perms_by_key.get(key)
                if not perm:
                    typer.echo(f"  [warn] permission '{key}' not found in DB — run 'db seed' first")
                    continue
                pair = (role.id, perm.id)
                if pair in existing_pairs:
                    continue
                db.add(RolePermission(role_id=role.id, permission_id=perm.id))
                existing_pairs.add(pair)
                added += 1

        await db.commit()
        typer.echo(f"Done. Added {added} role-permission assignments across {len(system_roles)} system roles.")


@app.command()
def migrate(
    revision: Annotated[
        str, typer.Option("--revision", "-r", help="Target revision (default: head).")
    ] = "head",
) -> None:
    """Run Alembic migrations forward to a target revision.

    Applies all pending migrations up to the specified revision.
    Defaults to [bold]head[/bold] (latest).

    [bold]Examples:[/bold]

        python -m app.manage db migrate               # migrate to latest
        python -m app.manage db migrate -r abc123      # migrate to specific revision
    """
    _run_alembic("upgrade", revision)


@app.command()
def downgrade(
    revision: Annotated[
        str, typer.Option("--revision", "-r", help="Target revision (e.g. -1 or specific hash).")
    ] = "-1",
) -> None:
    """Roll back the database to a previous migration revision.

    Defaults to [bold]-1[/bold] (one step back). Pass a specific revision hash
    to downgrade to that point.

    [bold]Examples:[/bold]

        python -m app.manage db downgrade              # roll back one step
        python -m app.manage db downgrade -r abc123    # roll back to specific revision
        python -m app.manage db downgrade -r base      # roll back all migrations
    """
    _run_alembic("downgrade", revision)


@app.command()
def current() -> None:
    """Show the current Alembic migration revision applied to the database.

    [bold]Example:[/bold]

        python -m app.manage db current
    """
    _run_alembic("current")


@app.command()
def history() -> None:
    """Show the full Alembic migration history (verbose).

    Lists every migration revision with its description, useful for
    finding a revision hash to migrate or downgrade to.

    [bold]Example:[/bold]

        python -m app.manage db history
    """
    _run_alembic("history", "--verbose")


def _run_alembic(*args: str) -> None:
    """Execute an alembic CLI command as a subprocess."""
    cmd = ["alembic", *args]
    typer.echo(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        typer.echo("Alembic command failed.", err=True)
        sys.exit(result.returncode)
