"""Plan service."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.plans.models import Plan, PlanFeature, PlanLimit

from app.schemas.pagination import Paginated

from .repository import PlanRepository
from .schemas import PlanCreate, PlanResponse, PlanUpdate
from .stripe_checkout import stripe_checkout_ready


class PlanService:
    """Plan business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = PlanRepository(session)

    async def list_public(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> Paginated[PlanResponse]:
        """List active plans (public, paginated)."""
        excl = settings.TRIAL_PLAN_SLUG if settings.TRIAL_ENABLED else None
        plans, total = await self.repo.list_active(
            skip=skip, limit=limit, exclude_slug=excl
        )
        items = [self._to_response(p) for p in plans]
        return Paginated(items=items, total=total, skip=skip, limit=limit)

    async def list_all(self, *, skip: int = 0, limit: int = 100) -> tuple[list[PlanResponse], int]:
        """List all plans (super admin)."""
        plans, total = await self.repo.list_all(skip=skip, limit=limit)
        return [self._to_response(p) for p in plans], total

    async def get_by_id(self, plan_id: UUID) -> PlanResponse | None:
        """Get plan by ID."""
        plan = await self.repo.get_by_id(plan_id)
        return self._to_response(plan) if plan else None

    async def create(self, data: PlanCreate) -> PlanResponse:
        """Create a plan (super admin)."""
        plan = Plan(
            name=data.name,
            slug=data.slug,
            type=data.type,
            price_monthly=data.price_monthly,
            price_yearly=data.price_yearly,
            stripe_price_id_monthly=data.stripe_price_id_monthly,
            stripe_price_id_yearly=data.stripe_price_id_yearly,
            trial_days=data.trial_days,
            is_active=data.is_active,
        )
        self.session.add(plan)
        await self.session.flush()

        for f in data.features:
            feat = PlanFeature(
                plan_id=plan.id,
                feature_key=f.feature_key,
                enabled=f.enabled,
            )
            self.session.add(feat)
        for lim in data.limits:
            limit = PlanLimit(
                plan_id=plan.id,
                limit_key=lim.limit_key,
                limit_value=lim.limit_value,
            )
            self.session.add(limit)

        await self.session.refresh(plan)
        return self._to_response(plan)

    async def update(self, plan_id: UUID, data: PlanUpdate) -> PlanResponse | None:
        """Update a plan (super admin)."""
        plan = await self.repo.get_by_id(plan_id)
        if not plan:
            return None

        update_fields = {
            "name", "slug", "type", "price_monthly", "price_yearly",
            "stripe_price_id_monthly", "stripe_price_id_yearly",
            "trial_days", "is_active",
        }
        for field in update_fields:
            val = getattr(data, field, None)
            if val is not None:
                setattr(plan, field, val)

        if data.features is not None:
            for f in plan.features:
                self.session.delete(f)
            for f in data.features:
                feat = PlanFeature(
                    plan_id=plan.id,
                    feature_key=f.feature_key,
                    enabled=f.enabled,
                )
                self.session.add(feat)

        if data.limits is not None:
            for lim in plan.limits:
                self.session.delete(lim)
            for lim in data.limits:
                limit = PlanLimit(
                    plan_id=plan.id,
                    limit_key=lim.limit_key,
                    limit_value=lim.limit_value,
                )
                self.session.add(limit)

        await self.session.refresh(plan)
        return self._to_response(plan)

    def _to_response(self, plan: Plan) -> PlanResponse:
        """Convert Plan model to PlanResponse."""
        from .schemas import PlanFeatureResponse, PlanLimitResponse

        monthly_ready, yearly_ready = stripe_checkout_ready(plan)
        return PlanResponse(
            id=plan.id,
            name=plan.name,
            slug=plan.slug,
            type=plan.type,
            price_monthly=float(plan.price_monthly) if plan.price_monthly is not None else None,
            price_yearly=float(plan.price_yearly) if plan.price_yearly is not None else None,
            stripe_price_id_monthly=plan.stripe_price_id_monthly,
            stripe_price_id_yearly=plan.stripe_price_id_yearly,
            trial_days=plan.trial_days,
            is_active=plan.is_active,
            created_at=plan.created_at,
            stripe_checkout_monthly_ready=monthly_ready,
            stripe_checkout_yearly_ready=yearly_ready,
            features=[PlanFeatureResponse.model_validate(f) for f in plan.features],
            limits=[PlanLimitResponse.model_validate(l) for l in plan.limits],
        )
