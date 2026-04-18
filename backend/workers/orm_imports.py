"""Load all ORM models for Celery workers (same order as ``alembic/env.py`` + extras).

Tasks often import a single model; SQLAlchemy needs referenced tables on
``Base.metadata`` to resolve FKs during flush/commit.
"""

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
from app.platform.models import *  # noqa: F401, F403
from app.feature_flags.models import *  # noqa: F401, F403
from app.rate_limits.models import *  # noqa: F401, F403
from app.homepage_templates.models import *  # noqa: F401, F403
