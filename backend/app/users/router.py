"""User router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.database import get_db
from app.dependencies import require_identity, CurrentIdentity, TenantContext
from app.core.permissions import require_permission
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import UserListResponse, UserResponse, UserUpdate
from .service import UserService

router = APIRouter()


def _get_identity(request: Request) -> CurrentIdentity:
    return require_identity(request)


@router.get("/", response_model=UserListResponse)
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    _: None = require_permission("users", "list"),
):
    """List users (admin, tenant-scoped)."""
    identity = _get_identity(request)
    tenant_ctx = getattr(request.state, "tenant", None)
    if not tenant_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    service = UserService(db)
    return await service.list_users(identity, tenant_ctx, skip=skip, limit=limit, search=search)


@router.get("/{id}", response_model=UserResponse)
async def get_user(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("users", "view"),
):
    """Get user by ID."""
    service = UserService(db)
    user = await service.get_user(id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/{id}", response_model=UserResponse)
async def update_user(
    id: UUID,
    data: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("users", "update"),
):
    """Update user profile (including timezone and language)."""
    identity = _get_identity(request)
    service = UserService(db)
    user = await service.update_profile(id, identity, data)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
