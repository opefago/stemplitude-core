"""Messaging router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import get_tenant_context, require_identity, TenantContext

from .schemas import MessageCreate, MessageListResponse, MessageResponse
from .service import MessageService

router = APIRouter()


def _get_tenant(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    return tenant


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    data: MessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "create"),
):
    """Create a new message."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = MessageService(db)
    message = await service.create_message(data, identity, tenant)
    if not message:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot send messages")
    return message


@router.get("/", response_model=MessageListResponse)
async def list_messages(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_permission("messages", "view"),
):
    """List messages for the current user (inbox)."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = MessageService(db)
    return await service.list_messages(identity, tenant, skip=skip, limit=limit)


@router.get("/{id}", response_model=MessageResponse)
async def get_message(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "view"),
):
    """Get message by ID."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = MessageService(db)
    message = await service.get_message(id, identity, tenant)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return message


@router.patch("/{id}/read", response_model=MessageResponse)
async def mark_message_read(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "update"),
):
    """Mark message as read."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = MessageService(db)
    message = await service.mark_read(id, identity, tenant)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return message
