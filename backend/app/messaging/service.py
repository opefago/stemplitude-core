"""Messaging service."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity, TenantContext
from app.messaging.models import Conversation
from app.realtime.user_events import publish_messages_changed

from .repository import ConversationRepository, MessageRepository
from .schemas import (
    AddGroupMembers,
    ConversationListResponse,
    ConversationMessageInfo,
    ConversationMessageListResponse,
    ConversationSummary,
    CreateGroupConversation,
    MemberInfo,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    SendConversationMessage,
    UpdateConversation,
)


class MessageService:
    """Message business logic (legacy direct messages)."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = MessageRepository(session)

    async def list_messages(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> MessageListResponse:
        if identity.sub_type != "user":
            return MessageListResponse(items=[], total=0)
        messages, total = await self.repo.list_for_recipient(
            identity.id,
            tenant_ctx.tenant_id,
            skip=skip,
            limit=limit,
        )
        return MessageListResponse(
            items=[MessageResponse.model_validate(m) for m in messages],
            total=total,
        )

    async def get_message(
        self,
        message_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> MessageResponse | None:
        if identity.sub_type != "user":
            return None
        message = await self.repo.get_by_id(message_id, tenant_ctx.tenant_id)
        if not message or message.recipient_id != identity.id:
            return None
        return MessageResponse.model_validate(message)

    async def create_message(
        self,
        data: MessageCreate,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> MessageResponse | None:
        if identity.sub_type != "user":
            return None
        message = await self.repo.create(
            sender_id=identity.id,
            recipient_id=data.recipient_id,
            tenant_id=tenant_ctx.tenant_id,
            subject=data.subject,
            body=data.body,
        )
        try:
            await publish_messages_changed(tenant_ctx.tenant_id, data.recipient_id)
        except Exception:
            pass
        return MessageResponse.model_validate(message)

    async def mark_read(
        self,
        message_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> MessageResponse | None:
        if identity.sub_type != "user":
            return None
        message = await self.repo.get_by_id(message_id, tenant_ctx.tenant_id)
        if not message or message.recipient_id != identity.id:
            return None
        message = await self.repo.mark_read(message)
        return MessageResponse.model_validate(message)


# ── Conversation service ───────────────────────────────────────────────────────

def _build_message_info(msg_dict: dict) -> ConversationMessageInfo:
    return ConversationMessageInfo(**msg_dict)


def _build_summary(
    conv: Conversation,
    members: list[dict],
    last_msg: dict | None,
    unread_count: int,
    viewer_id: UUID,
) -> ConversationSummary:
    member_infos = [MemberInfo(**m) for m in members]

    if conv.type == "dm":
        other = next((m for m in members if m["user_id"] != viewer_id), None)
        display_name = other["name"] if other else conv.name or "Direct Message"
    else:
        display_name = conv.name or "Group"

    return ConversationSummary(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        classroom_id=conv.classroom_id,
        display_name=display_name,
        members=member_infos,
        last_message=_build_message_info(last_msg) if last_msg else None,
        unread_count=unread_count,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


class ConversationService:
    """Conversation-based chat business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ConversationRepository(session)

    async def list_conversations(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationListResponse:
        if identity.sub_type != "user":
            return ConversationListResponse(items=[], total=0)

        conversations = await self.repo.list_for_user(identity.id, tenant_ctx.tenant_id)
        items = []
        for conv in conversations:
            members = await self.repo.get_members(conv.id)
            last_msg = await self.repo.get_last_message(conv.id)
            unread = await self.repo.get_unread_count(conv.id, identity.id)
            items.append(_build_summary(conv, members, last_msg, unread, identity.id))

        return ConversationListResponse(items=items, total=len(items))

    async def get_conversation(
        self,
        conversation_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationSummary | None:
        if identity.sub_type != "user":
            return None
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv:
            return None
        if not await self.repo.is_member(conversation_id, identity.id):
            return None
        members = await self.repo.get_members(conversation_id)
        last_msg = await self.repo.get_last_message(conversation_id)
        unread = await self.repo.get_unread_count(conversation_id, identity.id)
        return _build_summary(conv, members, last_msg, unread, identity.id)

    async def list_messages(
        self,
        conversation_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> ConversationMessageListResponse | None:
        if identity.sub_type != "user":
            return None
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv:
            return None
        if not await self.repo.is_member(conversation_id, identity.id):
            return None
        messages, total = await self.repo.list_messages(conversation_id, skip=skip, limit=limit)
        return ConversationMessageListResponse(
            items=[_build_message_info(m) for m in messages],
            total=total,
        )

    async def send_message(
        self,
        conversation_id: UUID,
        data: SendConversationMessage,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationMessageInfo | None:
        if identity.sub_type != "user":
            return None
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv:
            return None
        if not await self.repo.is_member(conversation_id, identity.id):
            return None

        msg = await self.repo.create_message(
            conversation_id=conversation_id,
            sender_id=identity.id,
            tenant_id=tenant_ctx.tenant_id,
            body=data.body,
        )
        await self.repo.touch_conversation(conversation_id)

        # Re-fetch with sender name
        messages, _ = await self.repo.list_messages(
            conversation_id, skip=0, limit=1
        )
        # The last inserted message — find it in the list
        sent = next(
            (m for m in messages if str(m["id"]) == str(msg.id)),
            None,
        )
        if not sent:
            # Fallback: minimal response
            from app.users.models import User
            from sqlalchemy import select

            user_result = await self.session.execute(
                select(User.first_name, User.last_name).where(User.id == identity.id)
            )
            row = user_result.one_or_none()
            sender_name = f"{row.first_name} {row.last_name}" if row else "Unknown"
            out = ConversationMessageInfo(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                sender_name=sender_name,
                body=msg.body,
                message_type=msg.message_type,
                is_read=msg.is_read,
                created_at=msg.created_at,
            )
        else:
            out = _build_message_info(sent)

        members = await self.repo.get_members(conversation_id)
        for m in members:
            uid = m["user_id"]
            try:
                await publish_messages_changed(
                    tenant_ctx.tenant_id,
                    uid,
                    conversation_id=conversation_id,
                )
            except Exception:
                pass
        return out

    async def mark_all_read(
        self,
        conversation_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> bool:
        if identity.sub_type != "user":
            return False
        if not await self.repo.is_member(conversation_id, identity.id):
            return False
        await self.repo.mark_all_read(conversation_id, identity.id)
        return True

    async def get_or_create_dm(
        self,
        recipient_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationSummary | None:
        if identity.sub_type != "user":
            return None

        existing = await self.repo.get_dm_between(
            identity.id, recipient_id, tenant_ctx.tenant_id
        )
        if existing:
            members = await self.repo.get_members(existing.id)
            last_msg = await self.repo.get_last_message(existing.id)
            unread = await self.repo.get_unread_count(existing.id, identity.id)
            return _build_summary(existing, members, last_msg, unread, identity.id)

        conv = await self.repo.create_conversation(
            tenant_id=tenant_ctx.tenant_id,
            type="dm",
        )
        await self.repo.add_member(conv.id, identity.id)
        await self.repo.add_member(conv.id, recipient_id)
        await self.session.flush()

        members = await self.repo.get_members(conv.id)
        return _build_summary(conv, members, None, 0, identity.id)

    async def create_custom_group(
        self,
        data: CreateGroupConversation,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationSummary | None:
        """Create a custom named group conversation."""
        if identity.sub_type != "user":
            return None

        conv = await self.repo.create_conversation(
            tenant_id=tenant_ctx.tenant_id,
            type="group",
            name=data.name,
        )
        # Always add the creator
        await self.repo.add_member(conv.id, identity.id)
        for uid in data.member_ids:
            if uid != identity.id:
                await self.repo.add_member(conv.id, uid)
        await self.session.flush()

        # Post system message announcing the group
        await self.repo.create_message(
            conversation_id=conv.id,
            sender_id=identity.id,
            tenant_id=tenant_ctx.tenant_id,
            body=f"Group \"{data.name}\" was created.",
            message_type="system",
        )

        members = await self.repo.get_members(conv.id)
        return _build_summary(conv, members, None, 0, identity.id)

    async def update_group(
        self,
        conversation_id: UUID,
        data: UpdateConversation,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationSummary | None:
        """Rename a group conversation. Any member can rename."""
        if identity.sub_type != "user":
            return None
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv or conv.type != "group":
            return None
        if not await self.repo.is_member(conversation_id, identity.id):
            return None
        updated = await self.repo.update_conversation_name(conversation_id, data.name)
        if not updated:
            return None
        members = await self.repo.get_members(conversation_id)
        last_msg = await self.repo.get_last_message(conversation_id)
        unread = await self.repo.get_unread_count(conversation_id, identity.id)
        return _build_summary(updated, members, last_msg, unread, identity.id)

    async def add_members(
        self,
        conversation_id: UUID,
        data: AddGroupMembers,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> ConversationSummary | None:
        """Add users to a group conversation."""
        if identity.sub_type != "user":
            return None
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv or conv.type != "group":
            return None
        if not await self.repo.is_member(conversation_id, identity.id):
            return None

        from app.users.models import User
        from sqlalchemy import select

        for uid in data.user_ids:
            await self.repo.add_member(conversation_id, uid)
            # System message: "<Name> was added to the group"
            user_result = await self.session.execute(
                select(User.first_name, User.last_name).where(User.id == uid)
            )
            row = user_result.one_or_none()
            name = f"{row.first_name} {row.last_name}" if row else "A user"
            await self.repo.create_message(
                conversation_id=conversation_id,
                sender_id=identity.id,
                tenant_id=tenant_ctx.tenant_id,
                body=f"{name} was added to the group.",
                message_type="system",
            )

        await self.repo.touch_conversation(conversation_id)
        await self.session.flush()

        conv = await self.repo.get_conversation_unscoped(conversation_id)
        if not conv:
            return None
        members = await self.repo.get_members(conversation_id)
        last_msg = await self.repo.get_last_message(conversation_id)
        unread = await self.repo.get_unread_count(conversation_id, identity.id)
        return _build_summary(conv, members, last_msg, unread, identity.id)

    async def remove_member(
        self,
        conversation_id: UUID,
        target_user_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> bool:
        """Remove a member from a group. Admins can remove anyone; others remove themselves."""
        if identity.sub_type != "user":
            return False
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv or conv.type != "group":
            return False
        if not await self.repo.is_member(conversation_id, identity.id):
            return False

        is_admin = getattr(tenant_ctx, "role", None) in ("admin", "owner")
        if target_user_id != identity.id and not is_admin:
            return False

        from app.users.models import User
        from sqlalchemy import select

        user_result = await self.session.execute(
            select(User.first_name, User.last_name).where(User.id == target_user_id)
        )
        row = user_result.one_or_none()
        name = f"{row.first_name} {row.last_name}" if row else "A user"

        await self.repo.remove_member(conversation_id, target_user_id)
        await self.repo.create_message(
            conversation_id=conversation_id,
            sender_id=identity.id,
            tenant_id=tenant_ctx.tenant_id,
            body=f"{name} left the group." if target_user_id == identity.id else f"{name} was removed from the group.",
            message_type="system",
        )
        await self.repo.touch_conversation(conversation_id)
        await self.session.flush()
        return True

    async def delete_conversation(
        self,
        conversation_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> bool:
        """Delete a conversation entirely. Requires messages.delete permission (enforced in router)."""
        if identity.sub_type != "user":
            return False
        conv = await self.repo.get_conversation(conversation_id, tenant_ctx.tenant_id)
        if not conv:
            return False
        await self.repo.delete_conversation(conversation_id)
        return True

    async def create_classroom_conversation(
        self,
        classroom_id: UUID,
        classroom_name: str,
        instructor_id: UUID | None,
        tenant_id: UUID,
    ) -> Conversation:
        """Create a group conversation for a newly created classroom."""
        conv = await self.repo.create_conversation(
            tenant_id=tenant_id,
            type="group",
            name=classroom_name,
            classroom_id=classroom_id,
        )
        if instructor_id:
            await self.repo.add_member(conv.id, instructor_id)
        return conv
