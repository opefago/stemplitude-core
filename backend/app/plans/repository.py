"""Plan repository."""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.plans.models import Plan, PlanFeature, PlanLimit


class PlanRepository:
    """Repository for plan queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        exclude_slugs: Sequence[str] | None = None,
    ) -> tuple[list[Plan], int]:
        """List active plans (public, paginated)."""
        conditions = [Plan.is_active == True]  # noqa: E712
        excl = [s.strip() for s in (exclude_slugs or ()) if s and s.strip()]
        if excl:
            conditions.append(Plan.slug.not_in(excl))
        count_stmt = select(func.count()).select_from(Plan).where(*conditions)
        total = int((await self.session.execute(count_stmt)).scalar() or 0)
        result = await self.session.execute(
            select(Plan)
            .where(*conditions)
            .options(
                selectinload(Plan.features),
                selectinload(Plan.limits),
            )
            .order_by(Plan.created_at)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

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
