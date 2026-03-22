from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.invitations.models import Invitation


class InvitationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, invitation: Invitation) -> Invitation:
        self.session.add(invitation)
        await self.session.flush()
        await self.session.refresh(invitation)
        return invitation

    async def get_by_token(self, token: str) -> Invitation | None:
        result = await self.session.execute(
            select(Invitation).where(Invitation.token == token)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: UUID, skip: int = 0, limit: int = 50
    ) -> tuple[list[Invitation], int]:
        total_result = await self.session.execute(
            select(func.count()).select_from(Invitation).where(Invitation.tenant_id == tenant_id)
        )
        total = total_result.scalar_one()
        result = await self.session.execute(
            select(Invitation)
            .where(Invitation.tenant_id == tenant_id)
            .order_by(Invitation.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def save(self, invitation: Invitation) -> Invitation:
        await self.session.flush()
        await self.session.refresh(invitation)
        return invitation
