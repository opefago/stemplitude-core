from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory

from .provider import EvaluationContext, EvaluationResult, InternalFeatureFlagProvider


class FeatureFlagService:
    """Provider facade.

    Keeps the runtime API stable so we can swap provider implementations later.
    """

    def __init__(self, db: AsyncSession):
        self.provider = InternalFeatureFlagProvider(db)

    async def evaluate(
        self,
        feature_key: str,
        *,
        user_id: UUID | None = None,
        tenant_id: UUID | None = None,
        traits: dict | None = None,
        stage: str | None = None,
        record_metrics: bool = True,
    ) -> EvaluationResult:
        ctx = EvaluationContext(
            flag_key=feature_key,
            user_id=user_id,
            tenant_id=tenant_id,
            traits=traits or {},
            stage=stage or ("production" if settings.is_production else "dev"),
        )
        return await self.provider.evaluate(ctx, record_metrics=record_metrics)

    async def is_enabled(
        self,
        feature_key: str,
        user_id: UUID | None = None,
        tenant_id: UUID | None = None,
        plan_slug: str | None = None,
    ) -> bool:
        traits = {}
        if plan_slug:
            traits["plan"] = plan_slug
        result = await self.evaluate(
            feature_key,
            user_id=user_id,
            tenant_id=tenant_id,
            traits=traits,
        )
        return result.enabled


async def evaluate_feature_flag(
    feature_key: str,
    *,
    user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    traits: dict | None = None,
    stage: str | None = None,
) -> EvaluationResult:
    async with async_session_factory() as session:
        service = FeatureFlagService(session)
        result = await service.evaluate(
            feature_key,
            user_id=user_id,
            tenant_id=tenant_id,
            traits=traits,
            stage=stage,
        )
        await session.commit()
        return result
