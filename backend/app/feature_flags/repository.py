from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    FeatureFlag,
    FeatureFlagMetricBucket,
    FeatureFlagRule,
    FeatureFlagTarget,
    FeatureFlagVariant,
)


class FeatureFlagRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_flags(
        self,
        *,
        include_archived: bool = False,
        query: str | None = None,
        status: str | None = None,
        stage: str | None = None,
        offset: int = 0,
        limit: int = 25,
    ) -> tuple[list[FeatureFlag], int]:
        filters = []
        if not include_archived:
            filters.append(FeatureFlag.archived_at.is_(None))
        if status and status != "all":
            filters.append(FeatureFlag.status == status)
        if stage and stage != "all":
            filters.append(FeatureFlag.stage == stage)
        if query:
            q = f"%{query.strip()}%"
            if q != "%%":
                filters.append(
                    FeatureFlag.key.ilike(q)
                    | FeatureFlag.owner.ilike(q)
                    | FeatureFlag.description.ilike(q)
                )

        count_stmt = select(func.count(FeatureFlag.id))
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = int((await self.db.execute(count_stmt)).scalar() or 0)

        stmt = (
            select(FeatureFlag)
            .order_by(FeatureFlag.key.asc())
            .offset(max(0, int(offset)))
            .limit(max(1, int(limit)))
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_flag_by_id(self, flag_id: UUID) -> FeatureFlag | None:
        result = await self.db.execute(select(FeatureFlag).where(FeatureFlag.id == flag_id))
        return result.scalar_one_or_none()

    async def get_flag_by_key(self, key: str) -> FeatureFlag | None:
        result = await self.db.execute(select(FeatureFlag).where(FeatureFlag.key == key))
        return result.scalar_one_or_none()

    async def create_flag(self, **values) -> FeatureFlag:
        flag = FeatureFlag(**values)
        self.db.add(flag)
        await self.db.flush()
        return flag

    async def list_rules(self, flag_id: UUID) -> list[FeatureFlagRule]:
        result = await self.db.execute(
            select(FeatureFlagRule)
            .where(FeatureFlagRule.flag_id == flag_id)
            .order_by(FeatureFlagRule.priority.asc(), FeatureFlagRule.created_at.asc())
        )
        return list(result.scalars().all())

    async def create_rule(self, **values) -> FeatureFlagRule:
        row = FeatureFlagRule(**values)
        self.db.add(row)
        await self.db.flush()
        return row

    async def get_rule_by_id(self, rule_id: UUID) -> FeatureFlagRule | None:
        result = await self.db.execute(select(FeatureFlagRule).where(FeatureFlagRule.id == rule_id))
        return result.scalar_one_or_none()

    async def delete_rule(self, rule_id: UUID) -> bool:
        result = await self.db.execute(delete(FeatureFlagRule).where(FeatureFlagRule.id == rule_id))
        return (result.rowcount or 0) > 0

    async def list_targets(self, flag_id: UUID) -> list[FeatureFlagTarget]:
        result = await self.db.execute(
            select(FeatureFlagTarget)
            .where(FeatureFlagTarget.flag_id == flag_id)
            .order_by(FeatureFlagTarget.target_type.asc(), FeatureFlagTarget.target_key.asc())
        )
        return list(result.scalars().all())

    async def create_target(self, **values) -> FeatureFlagTarget:
        row = FeatureFlagTarget(**values)
        self.db.add(row)
        await self.db.flush()
        return row

    async def get_target_by_id(self, target_id: UUID) -> FeatureFlagTarget | None:
        result = await self.db.execute(select(FeatureFlagTarget).where(FeatureFlagTarget.id == target_id))
        return result.scalar_one_or_none()

    async def delete_target(self, target_id: UUID) -> bool:
        result = await self.db.execute(delete(FeatureFlagTarget).where(FeatureFlagTarget.id == target_id))
        return (result.rowcount or 0) > 0

    async def list_variants(self, flag_id: UUID) -> list[FeatureFlagVariant]:
        result = await self.db.execute(
            select(FeatureFlagVariant)
            .where(FeatureFlagVariant.flag_id == flag_id)
            .order_by(FeatureFlagVariant.key.asc())
        )
        return list(result.scalars().all())

    async def replace_variants(self, flag_id: UUID, variants: list[dict]) -> list[FeatureFlagVariant]:
        await self.db.execute(delete(FeatureFlagVariant).where(FeatureFlagVariant.flag_id == flag_id))
        rows = [FeatureFlagVariant(flag_id=flag_id, **variant) for variant in variants]
        self.db.add_all(rows)
        await self.db.flush()
        return rows

    async def list_metric_buckets(
        self,
        flag_id: UUID,
        start_at: datetime,
        end_at: datetime,
        dimension_key: str = "all",
        dimension_value: str = "all",
        granularity: str = "day",
    ) -> list[FeatureFlagMetricBucket]:
        filters = [
            FeatureFlagMetricBucket.flag_id == flag_id,
            FeatureFlagMetricBucket.bucket_start >= start_at,
            FeatureFlagMetricBucket.bucket_start <= end_at,
            FeatureFlagMetricBucket.bucket_granularity == granularity,
        ]
        if dimension_key != "all":
            filters.append(FeatureFlagMetricBucket.dimension_key == dimension_key)
        if dimension_value != "all":
            filters.append(FeatureFlagMetricBucket.dimension_value == dimension_value)
        stmt = (
            select(FeatureFlagMetricBucket)
            .where(and_(*filters))
            .order_by(FeatureFlagMetricBucket.bucket_start.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
