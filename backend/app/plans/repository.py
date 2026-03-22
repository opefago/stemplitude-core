"""Plan repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.plans.models import Plan, PlanFeature, PlanLimit


class PlanRepository:
    """Repository for plan queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(self) -> list[Plan]:
        """List all active plans (public)."""
        result = await self.session.execute(
            select(Plan)
            .where(Plan.is_active == True)
            .options(
                selectinload(Plan.features),
                selectinload(Plan.limits),
            )
            .order_by(Plan.created_at)
        )
        return list(result.scalars().all())

    async def list_all(self, *, skip: int = 0, limit: int = 100) -> tuple[list[Plan], int]:
        """List all plans (super admin)."""
        count_result = await self.session.execute(select(func.count()).select_from(Plan))
        total = count_result.scalar() or 0

        result = await self.session.execute(
            select(Plan)
            .options(
                selectinload(Plan.features),
                selectinload(Plan.limits),
            )
            .order_by(Plan.created_at)
            .offset(skip)
            .limit(limit)
        )
        plans = list(result.scalars().all())
        return plans, total

    async def get_by_id(self, plan_id: UUID) -> Plan | None:
        """Get plan by ID."""
        result = await self.session.execute(
            select(Plan)
            .where(Plan.id == plan_id)
            .options(
                selectinload(Plan.features),
                selectinload(Plan.limits),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Plan | None:
        """Get plan by slug."""
        result = await self.session.execute(
            select(Plan)
            .where(Plan.slug == slug)
            .options(
                selectinload(Plan.features),
                selectinload(Plan.limits),
            )
        )
        return result.scalar_one_or_none()
