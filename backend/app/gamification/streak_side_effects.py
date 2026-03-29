"""Fire streak counter updates from non-gamification domains (isolated DB session)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from uuid import UUID

from app.core.calendar_tz import get_optional_request_calendar_tz

from app.database import async_session_factory
from app.dependencies import TenantContext
from app.tenants.models import Tenant

logger = logging.getLogger(__name__)


async def bump_students_streak(student_ids: Sequence[UUID], tenant_id: UUID) -> None:
    """Update streak rows for students; duplicates are ignored. Swallows errors."""
    ordered = list(dict.fromkeys(student_ids))
    if not ordered:
        return
    logger.debug(
        "bump_students_streak start tenant=%s student_count=%s request_calendar_tz=%r",
        tenant_id,
        len(ordered),
        get_optional_request_calendar_tz(),
    )
    try:
        async with async_session_factory() as session:
            tenant_row = await session.get(Tenant, tenant_id)
            slug = (tenant_row.slug if tenant_row and tenant_row.slug else "tenant")
            tenant_ctx = TenantContext(tenant_id=tenant_id, tenant_slug=slug)
            from app.gamification.service import GamificationService

            gamification = GamificationService(session)
            await gamification.track_students_activity_batch(ordered, tenant_ctx)
    except Exception:
        logger.exception(
            "bump_students_streak failed tenant=%s student_count=%s",
            tenant_id,
            len(ordered),
        )


async def bump_student_streak(student_id: UUID, tenant_id: UUID) -> None:
    await bump_students_streak([student_id], tenant_id)
