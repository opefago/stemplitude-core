from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import RateLimitProfileOverride


class RateLimitOverrideRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_scope(
        self, scope_type: str, scope_id: UUID
    ) -> RateLimitProfileOverride | None:
        result = await self.db.execute(
            select(RateLimitProfileOverride).where(
                RateLimitProfileOverride.scope_type == scope_type,
                RateLimitProfileOverride.scope_id == scope_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_overrides(
        self,
        *,
        scope_type: str | None = None,
        profile_key: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[RateLimitProfileOverride], int]:
        filters = []
        if scope_type:
            filters.append(RateLimitProfileOverride.scope_type == scope_type)
        if profile_key:
            filters.append(RateLimitProfileOverride.profile_key == profile_key)

        count_stmt = select(func.count(RateLimitProfileOverride.id))
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = int((await self.db.execute(count_stmt)).scalar() or 0)

        stmt = select(RateLimitProfileOverride).order_by(
            RateLimitProfileOverride.updated_at.desc()
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.offset(max(0, int(offset))).limit(max(1, int(limit)))
        rows = (await self.db.execute(stmt)).scalars().all()
        return list(rows), total

    async def upsert_override(
        self,
        *,
        scope_type: str,
        scope_id: UUID,
        mode: str,
        profile_key: str | None,
        custom_limit: int | None,
        custom_window_seconds: int | None,
        reason: str | None,
        updated_by: UUID | None,
    ) -> RateLimitProfileOverride:
        row = await self.get_by_scope(scope_type, scope_id)
        if row is None:
            row = RateLimitProfileOverride(
                scope_type=scope_type,
                scope_id=scope_id,
                mode=mode,
                profile_key=profile_key,
                custom_limit=custom_limit,
                custom_window_seconds=custom_window_seconds,
                reason=reason,
                updated_by=updated_by,
            )
            self.db.add(row)
        else:
            row.mode = mode
            row.profile_key = profile_key
            row.custom_limit = custom_limit
            row.custom_window_seconds = custom_window_seconds
            row.reason = reason
            row.updated_by = updated_by
        await self.db.flush()
        return row

    async def delete_override(self, scope_type: str, scope_id: UUID) -> bool:
        result = await self.db.execute(
            delete(RateLimitProfileOverride).where(
                RateLimitProfileOverride.scope_type == scope_type,
                RateLimitProfileOverride.scope_id == scope_id,
            )
        )
        return (result.rowcount or 0) > 0
