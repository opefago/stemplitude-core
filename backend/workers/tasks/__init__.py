"""Load task modules so Celery registers them when ``workers.tasks`` is imported."""

from workers.tasks import analytics_tasks  # noqa: F401
from workers.tasks import class_session_reminder_tasks  # noqa: F401
from workers.tasks import cleanup_tasks  # noqa: F401
from workers.tasks import email_tasks  # noqa: F401
from workers.tasks import integration_tasks  # noqa: F401
from workers.tasks import member_billing_tasks  # noqa: F401
from workers.tasks import notification_tasks  # noqa: F401
from workers.tasks import subscription_tasks  # noqa: F401
from workers.tasks import thumbnail_tasks  # noqa: F401
