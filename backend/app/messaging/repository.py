"""Messaging repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.messaging.models import Conversation, ConversationMember, Message
from app.users.models import User


class MessageRepository:
    """Repository for direct message queries (legacy inbox)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, message_id: UUID, tenant_id: UUID) -> Message | None:
        """Get message by ID within tenant."""
        result = await self.session.execute(
            select(Message).where(
                Message.id == message_id,
                Message.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_recipient(
        self,
        recipient_id: UUID,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Message], int]:
        """List messages for a recipient (inbox)."""
        base = select(Message).where(
            Message.recipient_id == recipient_id,
            Message.tenant_id == tenant_id,
        )
        count_base = select(func.count()).select_from(Message).where(
            Message.recipient_id == recipient_id,
            Message.tenant_id == tenant_id,
        )
        total_result = await self.session.execute(count_base)
        total = total_result.scalar() or 0
        result = await self.session.execute(
            base.order_by(Message.created_at.desc()).offset(skip).limit(limit)
        )
        messages = list(result.scalars().all())
        return messages, total

    async def create(
        self,
        sender_id: UUID,
        recipient_id: UUID,
        tenant_id: UUID,
        *,
        subject: str | None = None,
        body: str,
    ) -> Message:
        """Create a new direct message."""
        message = Message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            tenant_id=tenant_id,
            subject=subject,
            body=body,
        )
        self.session.add(message)
        await self.session.flush()
        await self.session.refresh(message)
        return message

    async def mark_read(self, message: Message) -> Message:
        """Mark message as read."""
        message.is_read = True
        await self.session.flush()
        await self.session.refresh(message)
        return message


class ConversationRepository:
    """Repository for conversation-based chat."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Conversation CRUD ──────────────────────────────────────────────────────

    async def get_conversation(self, conversation_id: UUID, tenant_id: UUID) -> Conversation | None:
        result = await self.session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_dm_between(
        self, user1_id: UUID, user2_id: UUID, tenant_id: UUID
    ) -> Conversation | None:
        """Find an existing DM conversation between two users."""
        # Conversations where both users are active members
        m1 = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user1_id,
            ConversationMember.left_at.is_(None),
        )
        m2 = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user2_id,
            ConversationMember.left_at.is_(None),
        )
        stmt = select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.type == "dm",
            Conversation.id.in_(m1),
            Conversation.id.in_(m2),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: UUID, tenant_id: UUID) -> list[Conversation]:
        """List all conversations the user is an active member of."""
        member_conv_ids = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user_id,
            ConversationMember.left_at.is_(None),
        )
        stmt = (
            select(Conversation)
            .where(
                Conversation.tenant_id == tenant_id,
                Conversation.id.in_(member_conv_ids),
            )
            .order_by(Conversation.updated_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_conversation(
        self,
        tenant_id: UUID,
        type: str,
        name: str | None = None,
        classroom_id: UUID | None = None,
    ) -> Conversation:
        conv = Conversation(
            tenant_id=tenant_id,
            type=type,
            name=name,
            classroom_id=classroom_id,
        )
        self.session.add(conv)
        await self.session.flush()
        await self.session.refresh(conv)
        return conv

    async def touch_conversation(self, conversation_id: UUID) -> None:
        """Update updated_at to bubble conversation to top of list."""
        from datetime import datetime, timezone
        from sqlalchemy import update

        await self.session.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=datetime.now(timezone.utc))
        )

    # ── Members ────────────────────────────────────────────────────────────────

    async def get_members(self, conversation_id: UUID) -> list[dict]:
        """Return members with resolved display names."""
        stmt = (
            select(
                ConversationMember.user_id,
                ConversationMember.joined_at,
                ConversationMember.left_at,
                User.first_name,
                User.last_name,
            )
            .join(User, User.id == ConversationMember.user_id)
            .where(ConversationMember.conversation_id == conversation_id)
        )
        result = await self.session.execute(stmt)
        return [
            {
                "user_id": row.user_id,
                "name": f"{row.first_name} {row.last_name}",
                "joined_at": row.joined_at,
                "left_at": row.left_at,
            }
            for row in result.all()
        ]

    async def is_member(self, conversation_id: UUID, user_id: UUID) -> bool:
        result = await self.session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
                ConversationMember.left_at.is_(None),
            )
        )
        return result.scalar_one_or_none() is not None

    async def add_member(self, conversation_id: UUID, user_id: UUID) -> ConversationMember:
        from datetime import datetime, timezone
        from sqlalchemy.dialects.postgresql import insert

        stmt = (
            insert(ConversationMember)
            .values(conversation_id=conversation_id, user_id=user_id, joined_at=datetime.now(timezone.utc))
            .on_conflict_do_update(
                constraint="uq_conversation_member",
                set_={"left_at": None, "joined_at": datetime.now(timezone.utc)},
            )
            .returning(ConversationMember)
        )
        result = await self.session.execute(stmt)
        member = result.scalar_one()
        return member

    async def remove_member(self, conversation_id: UUID, user_id: UUID) -> None:
        from datetime import datetime, timezone
        from sqlalchemy import update

        await self.session.execute(
            update(ConversationMember)
            .where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
            )
            .values(left_at=datetime.now(timezone.utc))
        )

    # ── Messages ───────────────────────────────────────────────────────────────

    async def list_messages(
        self,
        conversation_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        """List messages with sender names, oldest-first for chat display."""
        count_stmt = (
            select(func.count())
            .select_from(Message)
            .where(Message.conversation_id == conversation_id)
        )
        total = (await self.session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(
                Message.id,
                Message.conversation_id,
                Message.sender_id,
                Message.body,
                Message.message_type,
                Message.is_read,
                Message.created_at,
                User.first_name,
                User.last_name,
            )
            .join(User, User.id == Message.sender_id)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        messages = [
            {
                "id": r.id,
                "conversation_id": r.conversation_id,
                "sender_id": r.sender_id,
                "sender_name": "System" if r.message_type == "system" else f"{r.first_name} {r.last_name}",
                "body": r.body,
                "message_type": r.message_type,
                "is_read": r.is_read,
                "created_at": r.created_at,
            }
            for r in rows
        ]
        return messages, total

    async def get_last_message(self, conversation_id: UUID) -> dict | None:
        """Get the most recent message in a conversation."""
        stmt = (
            select(
                Message.id,
                Message.conversation_id,
                Message.sender_id,
                Message.body,
                Message.message_type,
                Message.is_read,
                Message.created_at,
                User.first_name,
                User.last_name,
            )
            .join(User, User.id == Message.sender_id)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        row = result.one_or_none()
        if not row:
            return None
        return {
            "id": row.id,
            "conversation_id": row.conversation_id,
            "sender_id": row.sender_id,
            "sender_name": "System" if row.message_type == "system" else f"{row.first_name} {row.last_name}",
            "body": row.body,
            "message_type": row.message_type,
            "is_read": row.is_read,
            "created_at": row.created_at,
        }

    async def get_unread_count(self, conversation_id: UUID, user_id: UUID) -> int:
        """Count unread messages in a conversation for a specific user."""
        stmt = (
            select(func.count())
            .select_from(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.is_read.is_(False),
                Message.sender_id != user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def create_message(
        self,
        conversation_id: UUID,
        sender_id: UUID,
        tenant_id: UUID,
        body: str,
        message_type: str = "text",
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            tenant_id=tenant_id,
            body=body,
            message_type=message_type,
        )
        self.session.add(msg)
        await self.session.flush()
        await self.session.refresh(msg)
        return msg

    async def get_conversation_unscoped(self, conversation_id: UUID) -> Conversation | None:
        """Get conversation by ID without tenant check (used internally)."""
        result = await self.session.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        return result.scalar_one_or_none()

    async def update_conversation_name(self, conversation_id: UUID, name: str) -> Conversation | None:
        """Rename a group conversation."""
        from sqlalchemy import update as sa_update

        await self.session.execute(
            sa_update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(name=name)
        )
        await self.session.flush()
        return await self.get_conversation_unscoped(conversation_id)

    async def delete_conversation(self, conversation_id: UUID) -> None:
        """Hard-delete a conversation and all its messages/members (cascade)."""
        from sqlalchemy import delete as sa_delete

        await self.session.execute(
            sa_delete(Conversation).where(Conversation.id == conversation_id)
        )

    async def mark_all_read(self, conversation_id: UUID, user_id: UUID) -> None:
        """Mark all messages in a conversation as read for a user (excludes own messages)."""
        from sqlalchemy import update

        await self.session.execute(
            update(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.sender_id != user_id,
                Message.is_read.is_(False),
            )
            .values(is_read=True)
        )
