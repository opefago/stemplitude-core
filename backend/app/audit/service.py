"""Audit service for querying events and running retention cleanup."""

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from .repository import AuditRepository
from .schemas import AuditEventListResponse, AuditRetentionResult

logger = logging.getLogger(__name__)


class AuditService:
    def __init__(self, db: AsyncSession):
        self.repo = AuditRepository(db)

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
    ) -> AuditEventListResponse:
        items, total = await self.repo.list_events(
            table_name=table_name,
            record_id=record_id,
            action=action,
            tenant_id=tenant_id,
            app_user_id=app_user_id,
            since=since,
            until=until,
            skip=skip,
            limit=limit,
        )
        logger.debug("Audit query table=%s action=%s count=%d", table_name, action, total)
        return AuditEventListResponse(items=items, total=total)

    async def get_record_history(
        self,
        table_name: str,
        record_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> AuditEventListResponse:
        items, total = await self.repo.get_record_history(
            table_name, record_id, skip=skip, limit=limit
        )
        return AuditEventListResponse(items=items, total=total)

    async def cleanup(self, cutoff: datetime) -> AuditRetentionResult:
        count = await self.repo.delete_before(cutoff)
        return AuditRetentionResult(deleted_count=count, cutoff_date=cutoff)
