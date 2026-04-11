"""Conversations router — group and DM chat."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, require_identity

from .schemas import (
    AddGroupMembers,
    ConversationListResponse,
    ConversationMessageInfo,
    ConversationMessageListResponse,
    ConversationSummary,
    CreateDmConversation,
    CreateGroupConversation,
    SendConversationMessage,
    UpdateConversation,
)
from .service import ConversationService

router = APIRouter()


def _get_tenant(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    return tenant


@router.get("/", response_model=ConversationListResponse)
async def list_conversations(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_permission("messages", "view"),
):
    """List conversations for the current user (paginated)."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    return await service.list_conversations(identity, tenant, skip=skip, limit=limit)


@router.post("/group", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_group_conversation(
    data: CreateGroupConversation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "create"),
):
    """Create a new custom group conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    conv = await service.create_custom_group(data, identity, tenant)
    if not conv:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create group")
    return conv


@router.post("/dm", response_model=ConversationSummary, status_code=status.HTTP_200_OK)
async def get_or_create_dm(
    data: CreateDmConversation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "create"),
):
    """Get or create a direct message conversation with another user."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    conv = await service.get_or_create_dm(data.recipient_id, identity, tenant)
    if not conv:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create conversation")
    return conv


@router.get("/{id}", response_model=ConversationSummary)
async def get_conversation(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "view"),
):
    """Get a single conversation by ID."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    conv = await service.get_conversation(id, identity, tenant)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


@router.get("/{id}/messages", response_model=ConversationMessageListResponse)
async def list_conversation_messages(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: None = require_permission("messages", "view"),
):
    """List messages in a conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    result = await service.list_messages(id, identity, tenant, skip=skip, limit=limit)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return result


@router.post("/{id}/messages", response_model=ConversationMessageInfo, status_code=status.HTTP_201_CREATED)
async def send_message(
    id: UUID,
    data: SendConversationMessage,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "create"),
):
    """Send a message to a conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    msg = await service.send_message(id, data, identity, tenant)
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot send message to this conversation",
        )
    return msg


@router.post("/{id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_conversation_read(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "update"),
):
    """Mark all messages in a conversation as read."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    ok = await service.mark_all_read(id, identity, tenant)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


# ── Group management (requires messages.edit / messages.delete) ────────────────

@router.patch("/{id}", response_model=ConversationSummary)
async def update_group_name(
    id: UUID,
    data: UpdateConversation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "edit"),
):
    """Rename a group conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    conv = await service.update_group(id, data, identity, tenant)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found or cannot rename")
    return conv


@router.post("/{id}/members", response_model=ConversationSummary)
async def add_group_members(
    id: UUID,
    data: AddGroupMembers,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "edit"),
):
    """Add members to a group conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    conv = await service.add_members(id, data, identity, tenant)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return conv


@router.delete("/{id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "edit"),
):
    """Remove a member from a group conversation."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    ok = await service.remove_member(id, user_id, identity, tenant)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove this member",
        )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("messages", "delete"),
):
    """Delete a conversation (admin only)."""
    tenant = _get_tenant(request)
    identity = require_identity(request)
    service = ConversationService(db)
    ok = await service.delete_conversation(id, identity, tenant)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
