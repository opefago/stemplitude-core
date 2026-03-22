"""User repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tenants.models import Membership
from app.users.models import User


class UserRepository:
    """Repository for user queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        """Get user by ID."""
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        """Get user by email."""
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def list_tenant_users(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> tuple[list[User], int]:
        """List users who are members of the tenant. Admin, tenant-scoped."""
        user_ids_subq = (
            select(Membership.user_id)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
            )
        )
        base = select(User).where(User.id.in_(user_ids_subq))
        count_base = select(func.count()).select_from(User).where(User.id.in_(user_ids_subq))

        if search:
            search_pattern = f"%{search}%"
            base = base.where(
                (User.email.ilike(search_pattern))
                | (User.first_name.ilike(search_pattern))
                | (User.last_name.ilike(search_pattern))
            )
            count_base = count_base.where(
                (User.email.ilike(search_pattern))
                | (User.first_name.ilike(search_pattern))
                | (User.last_name.ilike(search_pattern))
            )

        total_result = await self.session.execute(count_base)
        total = total_result.scalar() or 0

        result = await self.session.execute(
            base.order_by(User.last_name, User.first_name).offset(skip).limit(limit)
        )
        users = list(result.scalars().all())
        return users, total
