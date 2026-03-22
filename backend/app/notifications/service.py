"""Notifications service."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity

from .repository import NotificationRepository
from .schemas import (
    NotificationListResponse,
    NotificationResponse,
    NotificationUnreadCountResponse,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Notification business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = NotificationRepository(session)

    async def list_notifications(
        self,
        identity: CurrentIdentity,
        *,
        skip: int = 0,
        limit: int = 50,
        is_read: bool | None = None,
    ) -> NotificationListResponse:
        """List notifications for the current user or student."""
        if identity.sub_type == "student":
            notifications, total = await self.repo.list_for_student(
                identity.id,
                skip=skip,
                limit=limit,
                is_read=is_read,
            )
        elif identity.sub_type == "user":
            logger.debug("Notification list user=%s skip=%d limit=%d", identity.id, skip, limit)
            notifications, total = await self.repo.list_for_user(
                identity.id,
                skip=skip,
                limit=limit,
                is_read=is_read,
            )
        else:
            return NotificationListResponse(items=[], total=0)
        return NotificationListResponse(
            items=[NotificationResponse.model_validate(n) for n in notifications],
            total=total,
        )

    async def unread_count(self, identity: CurrentIdentity) -> NotificationUnreadCountResponse:
        """Count unread only (cheap query for header badges)."""
        if identity.sub_type == "student":
            n = await self.repo.count_unread_for_student(identity.id)
        elif identity.sub_type == "user":
            n = await self.repo.count_unread_for_user(identity.id)
        else:
            n = 0
        return NotificationUnreadCountResponse(unread_count=n)

    async def get_notification(
        self,
        notification_id: UUID,
        identity: CurrentIdentity,
    ) -> NotificationResponse | None:
        """Get notification by ID."""
        if identity.sub_type == "student":
            notification = await self.repo.get_by_id_for_student(notification_id, identity.id)
        elif identity.sub_type == "user":
            logger.debug("Notification read user=%s notification=%s", identity.id, notification_id)
            notification = await self.repo.get_by_id_for_user(notification_id, identity.id)
        else:
            return None
        return NotificationResponse.model_validate(notification) if notification else None

    async def mark_read(
        self,
        notification_id: UUID,
        identity: CurrentIdentity,
    ) -> NotificationResponse | None:
        """Mark notification as read."""
        if identity.sub_type == "student":
            notification = await self.repo.get_by_id_for_student(notification_id, identity.id)
        elif identity.sub_type == "user":
            notification = await self.repo.get_by_id_for_user(notification_id, identity.id)
        else:
            return None
        if not notification:
            return None
        notification = await self.repo.mark_read(notification)
        return NotificationResponse.model_validate(notification)

    async def mark_all_read(self, identity: CurrentIdentity) -> int:
        """Mark all notifications as read. Returns count updated."""
        if identity.sub_type == "student":
            return await self.repo.mark_all_read_for_student(identity.id)
        if identity.sub_type == "user":
            return await self.repo.mark_all_read(identity.id)
        return 0
