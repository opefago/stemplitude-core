from uuid import UUID

from app.core.redis import get_redis
from app.config import settings


class FeatureFlagService:
    """Thin wrapper around Flagsmith SDK with Redis caching."""

    def __init__(self):
        self._flagsmith = None

    def _get_flagsmith(self):
        if self._flagsmith is None and settings.FLAGSMITH_API_KEY:
            from flagsmith import Flagsmith
            self._flagsmith = Flagsmith(
                environment_key=settings.FLAGSMITH_API_KEY,
                api_url=settings.FLAGSMITH_API_URL,
            )
        return self._flagsmith

    async def is_enabled(
        self,
        feature_key: str,
        user_id: UUID | None = None,
        tenant_id: UUID | None = None,
        plan_slug: str | None = None,
    ) -> bool:
        redis = await get_redis()
        cache_key = f"ff:{feature_key}:{tenant_id}:{user_id}"

        cached = await redis.get(cache_key)
        if cached is not None:
            return cached == "1"

        flagsmith = self._get_flagsmith()
        if flagsmith is None:
            return True

        try:
            traits = {}
            if tenant_id:
                traits["tenant_id"] = str(tenant_id)
            if plan_slug:
                traits["plan"] = plan_slug

            identifier = str(user_id) if user_id else "anonymous"
            flags = flagsmith.get_identity_flags(identifier=identifier, traits=traits)
            enabled = flags.is_feature_enabled(feature_key)
        except Exception:
            enabled = True

        await redis.setex(cache_key, 60, "1" if enabled else "0")
        return enabled


feature_flag_service = FeatureFlagService()
