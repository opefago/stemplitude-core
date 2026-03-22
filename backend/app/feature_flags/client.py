"""Flagsmith client initialization.

All flag management (creation, targeting, rollout percentages) happens
in the Flagsmith dashboard, not in our API. This module just initializes
the SDK client for runtime evaluation.
"""

from app.config import settings


def get_flagsmith_client():
    if not settings.FLAGSMITH_API_KEY:
        return None

    from flagsmith import Flagsmith

    return Flagsmith(
        environment_key=settings.FLAGSMITH_API_KEY,
        api_url=settings.FLAGSMITH_API_URL,
    )
