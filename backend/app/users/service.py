"""User service."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity, TenantContext

from .repository import UserRepository
from .schemas import UserListResponse, UserResponse, UserUpdate

logger = logging.getLogger(__name__)


class UserService:
    """User business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)

    async def list_users(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
        *,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> UserListResponse:
        """List users. Admin only, tenant-scoped when tenant context present."""
        if not tenant_ctx:
            return UserListResponse(items=[], total=0)
        users, total = await self.repo.list_tenant_users(
            tenant_ctx.tenant_id, skip=skip, limit=limit, search=search
        )
        return UserListResponse(
            items=[UserResponse.model_validate(u) for u in users],
            total=total,
        )

    async def get_user(self, user_id: UUID) -> UserResponse | None:
        """Get user by ID."""
        user = await self.repo.get_by_id(user_id)
        return UserResponse.model_validate(user) if user else None

    async def update_profile(
        self,
        user_id: UUID,
        identity: CurrentIdentity,
        data: UserUpdate,
    ) -> UserResponse | None:
        """Update user profile (timezone, language, etc.). Users can update own profile."""
        from fastapi import HTTPException, status as http_status

        is_self = identity.id == user_id
        is_privileged = identity.role in ("owner", "admin") or identity.is_super_admin

        if not is_self and not is_privileged:
            logger.warning(
                "User update denied: caller=%s target=%s role=%s",
                identity.id, user_id, identity.role,
            )
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="You can only update your own profile",
            )

        user = await self.repo.get_by_id(user_id)
        if not user:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "is_active" in update_data and not is_privileged:
            logger.warning(
                "Non-admin tried to set is_active: caller=%s target=%s",
                identity.id, user_id,
            )
            del update_data["is_active"]

        for k, v in update_data.items():
            setattr(user, k, v)
        if "is_active" in update_data and update_data["is_active"] is False:
            logger.info("User deactivated id=%s by=%s", user_id, identity.id)
        else:
            logger.info("User updated id=%s by=%s", user_id, identity.id)
        await self.session.flush()
        await self.session.refresh(user)
        return UserResponse.model_validate(user)
