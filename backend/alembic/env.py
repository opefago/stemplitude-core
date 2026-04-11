import asyncio
import sys
from pathlib import Path
from logging.config import fileConfig

# Backend root must be importable as `app` (alembic may be run from another cwd or venv).
_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Import all models so Alembic can detect them
from app.users.models import *  # noqa: F401, F403
from app.tenants.models import *  # noqa: F401, F403
from app.students.models import *  # noqa: F401, F403
from app.roles.models import *  # noqa: F401, F403
from app.plans.models import *  # noqa: F401, F403
from app.subscriptions.models import *  # noqa: F401, F403
from app.licenses.models import *  # noqa: F401, F403
from app.capabilities.models import *  # noqa: F401, F403
from app.programs.models import *  # noqa: F401, F403
from app.classrooms.models import *  # noqa: F401, F403
from app.curriculum.models import *  # noqa: F401, F403
from app.labs.models import *  # noqa: F401, F403
from app.progress.models import *  # noqa: F401, F403
from app.messaging.models import *  # noqa: F401, F403
from app.notifications.models import *  # noqa: F401, F403
from app.email.models import *  # noqa: F401, F403
from app.assets.models import *  # noqa: F401, F403
from app.admin.models import *  # noqa: F401, F403
from app.integrations.models import *  # noqa: F401, F403
from app.invitations.models import *  # noqa: F401, F403
from app.trials.models import *  # noqa: F401, F403
from app.gamification.models import *  # noqa: F401, F403
from app.member_billing.models import *  # noqa: F401, F403
from app.platform.models import *  # noqa: F401, F403
from app.analytics.models import *  # noqa: F401, F403
from app.growth.models import *  # noqa: F401, F403

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
