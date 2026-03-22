"""Notifications repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification


class NotificationRepository:
    """Repository for notification queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id_for_user(self, notification_id: UUID, user_id: UUID) -> Notification | None:
        """Get notification by ID for a user (parent/instructor/admin)."""
        result = await self.session.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_for_student(self, notification_id: UUID, student_id: UUID) -> Notification | None:
        """Get notification by ID for a student recipient."""
        result = await self.session.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.student_id == student_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
        is_read: bool | None = None,
    ) -> tuple[list[Notification], int]:
        """List notifications for a user."""
        base = select(Notification).where(Notification.user_id == user_id)
        count_base = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id
        )
        if is_read is not None:
            base = base.where(Notification.is_read == is_read)
            count_base = count_base.where(Notification.is_read == is_read)
        total_result = await self.session.execute(count_base)
        total = total_result.scalar() or 0
        result = await self.session.execute(
            base.order_by(Notification.created_at.desc()).offset(skip).limit(limit)
        )
        notifications = list(result.scalars().all())
        return notifications, total

    async def list_for_student(
        self,
        student_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
        is_read: bool | None = None,
    ) -> tuple[list[Notification], int]:
        """List notifications for a student (JWT sub = students.id)."""
        base = select(Notification).where(Notification.student_id == student_id)
        count_base = select(func.count()).select_from(Notification).where(
            Notification.student_id == student_id
        )
        if is_read is not None:
            base = base.where(Notification.is_read == is_read)
            count_base = count_base.where(Notification.is_read == is_read)
        total_result = await self.session.execute(count_base)
        total = total_result.scalar() or 0
        result = await self.session.execute(
            base.order_by(Notification.created_at.desc()).offset(skip).limit(limit)
        )
        notifications = list(result.scalars().all())
        return notifications, total

    async def mark_read(self, notification: Notification) -> Notification:
        """Mark notification as read."""
        notification.is_read = True
        await self.session.flush()
        await self.session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: UUID) -> int:
        """Mark all notifications as read for user. Returns count updated."""
        from sqlalchemy import update

        result = await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)
            .values(is_read=True)
        )
        return result.rowcount or 0

    async def count_unread_for_user(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)
        )
        return int(result.scalar() or 0)

    async def count_unread_for_student(self, student_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.student_id == student_id, Notification.is_read == False)
        )
        return int(result.scalar() or 0)

    async def mark_all_read_for_student(self, student_id: UUID) -> int:
        """Mark all notifications as read for a student. Returns count updated."""
        from sqlalchemy import update

        result = await self.session.execute(
            update(Notification)
            .where(Notification.student_id == student_id, Notification.is_read == False)
            .values(is_read=True)
        )
        return result.rowcount or 0
