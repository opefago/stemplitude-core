"""STEMplitude management CLI.

Usage:
    python -m app.manage <group> <command> [OPTIONS]

Groups:
    users    - Create super-admins, list admin accounts
    tenants  - Create/manage tenants, members, tenant roles, and permissions
    db       - Run migrations, seed data, inspect history

Examples:
    python -m app.manage users create-superadmin --email admin@stemplitude.com
    python -m app.manage tenants create --name "Robotics Academy" --slug robotics-academy --code ROBO2024
    python -m app.manage tenants add-member --slug robotics-academy --email user@example.com --role instructor
    python -m app.manage tenants list-roles --slug robotics-academy
    python -m app.manage tenants create-role --slug robotics-academy --role-name TA --role-slug ta --template instructor
    python -m app.manage db seed
    python -m app.manage db migrate

Help:
    python -m app.manage --help
    python -m app.manage <group> --help
    python -m app.manage <group> <command> --help
"""

import typer

from app.commands.db import app as db_app
from app.commands.tenants import app as tenants_app
from app.commands.users import app as users_app

app = typer.Typer(
    name="manage",
    help=(
        "STEMplitude platform management CLI.\n\n"
        "Manage users, tenants (organizations), roles, memberships, "
        "database migrations, and seed data from the command line.\n\n"
        "Run [bold]python -m app.manage <group> --help[/bold] for group-specific commands."
    ),
    no_args_is_help=True,
    pretty_exceptions_enable=True,
    rich_markup_mode="rich",
)

app.add_typer(
    users_app,
    name="users",
    help="Create super-admin accounts, list admins, and manage platform-level users.",
)
app.add_typer(
    tenants_app,
    name="tenants",
    help="Create and manage tenants (organizations), memberships, and custom roles.",
)
app.add_typer(
    db_app,
    name="db",
    help="Run Alembic migrations, seed reference data, and inspect migration history.",
)


if __name__ == "__main__":
    app()
