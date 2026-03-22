"""Notifications router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import require_identity

from .schemas import (
    NotificationListResponse,
    NotificationResponse,
    NotificationUnreadCountResponse,
)
from .service import NotificationService

router = APIRouter()


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def notification_unread_count(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("notifications", "view"),
):
    """Unread count only — use for header badges without loading full notification bodies."""
    identity = require_identity(request)
    service = NotificationService(db)
    return await service.unread_count(identity)


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0, le=500_000),
    limit: int = Query(50, ge=1, le=100),
    is_read: bool | None = None,
    _: None = require_permission("notifications", "view"),
):
    """List notifications for the current user or student (paginated; max limit=100 per request)."""
    identity = require_identity(request)
    service = NotificationService(db)
    return await service.list_notifications(identity, skip=skip, limit=limit, is_read=is_read)


@router.patch("/{id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("notifications", "update"),
):
    """Mark notification as read."""
    identity = require_identity(request)
    service = NotificationService(db)
    notification = await service.mark_read(id, identity)
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notification


@router.post("/mark-all-read")
async def mark_all_read(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("notifications", "update"),
):
    """Mark all notifications as read."""
    identity = require_identity(request)
    service = NotificationService(db)
    count = await service.mark_all_read(identity)
    return {"marked_count": count}
