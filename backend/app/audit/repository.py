"""Repository for querying audit events (read-only)."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuditEvent


class AuditRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_events(
        self,
        *,
        table_name: str | None = None,
        record_id: str | None = None,
        action: str | None = None,
        tenant_id: str | None = None,
        app_user_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditEvent], int]:
        filters = [
            (table_name, lambda v: AuditEvent.table_name == v),
            (record_id, lambda v: AuditEvent.record_id == v),
            (action, lambda v: AuditEvent.action == v),
            (tenant_id, lambda v: AuditEvent.tenant_id == v),
            (app_user_id, lambda v: AuditEvent.app_user_id == v),
            (since, lambda v: AuditEvent.created_at >= v),
            (until, lambda v: AuditEvent.created_at <= v),
        ]
        clauses = [build(val) for val, build in filters if val is not None]

        q = select(AuditEvent).where(*clauses)
        count_q = select(func.count(AuditEvent.id)).where(*clauses)

        total = (await self.db.execute(count_q)).scalar() or 0
        q = q.order_by(AuditEvent.created_at.desc()).offset(skip).limit(limit)
        items = (await self.db.execute(q)).scalars().all()
        return list(items), total

    async def get_record_history(
        self,
        table_name: str,
        record_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[AuditEvent], int]:
        where = (
            AuditEvent.table_name == table_name,
            AuditEvent.record_id == record_id,
        )
        total = (
            await self.db.execute(select(func.count(AuditEvent.id)).where(*where))
        ).scalar() or 0
        q = (
            select(AuditEvent)
            .where(*where)
            .order_by(AuditEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list((await self.db.execute(q)).scalars().all())
        return items, total

    async def delete_before(
        self, cutoff: datetime, batch_size: int = 5000
    ) -> int:
        total_deleted = 0
        while True:
            batch_ids = (
                await self.db.execute(
                    select(AuditEvent.id)
                    .where(AuditEvent.created_at < cutoff)
                    .limit(batch_size)
                )
            ).scalars().all()
            if not batch_ids:
                break
            await self.db.execute(
                delete(AuditEvent).where(AuditEvent.id.in_(batch_ids))
            )
            await self.db.commit()
            total_deleted += len(batch_ids)
        return total_deleted
