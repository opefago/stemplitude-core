"""Invitation router — user and parent invite flows."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentIdentity, get_current_identity
from app.invitations.schemas import (
    AcceptInviteResponse,
    CreateParentInviteRequest,
    CreateUserInviteRequest,
    InvitationListResponse,
    InvitationResponse,
    ValidateInviteResponse,
)
from app.invitations.service import InvitationEmailEnqueueError, InvitationService

router = APIRouter()


def _require_tenant_identity(identity: CurrentIdentity = Depends(get_current_identity)) -> CurrentIdentity:
    if identity.sub_type != "user" or not identity.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant membership required",
        )
    if identity.role not in ("owner", "admin", "instructor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to send invitations",
        )
    return identity


@router.post(
    "/users",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to join the tenant",
)
async def invite_user(
    data: CreateUserInviteRequest,
    identity: CurrentIdentity = Depends(_require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    svc = InvitationService(db)
    try:
        return await svc.create_user_invite(identity.tenant_id, identity.id, data)
    except InvitationEmailEnqueueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/parents",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a parent to join the tenant with linked students",
)
async def invite_parent(
    data: CreateParentInviteRequest,
    identity: CurrentIdentity = Depends(_require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    if not data.student_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one student must be selected",
        )
    svc = InvitationService(db)
    try:
        return await svc.create_parent_invite(identity.tenant_id, identity.id, data)
    except InvitationEmailEnqueueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/",
    response_model=InvitationListResponse,
    summary="List all invitations for the current tenant",
)
async def list_invitations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    identity: CurrentIdentity = Depends(_require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    svc = InvitationService(db)
    return await svc.list_invites(identity.tenant_id, skip=skip, limit=limit)


@router.get(
    "/validate/{token}",
    response_model=ValidateInviteResponse,
    summary="Validate an invite token and return details (public)",
)
async def validate_invite(token: str, db: AsyncSession = Depends(get_db)):
    svc = InvitationService(db)
    try:
        return await svc.validate_token(token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/accept/{token}",
    response_model=AcceptInviteResponse,
    summary="Accept an invitation (requires authentication)",
)
async def accept_invite(
    token: str,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: AsyncSession = Depends(get_db),
):
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only adult user accounts can accept invitations",
        )
    svc = InvitationService(db)
    try:
        return await svc.accept_invite(token, identity.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/{token}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a pending invitation",
)
async def revoke_invite(
    token: str,
    identity: CurrentIdentity = Depends(_require_tenant_identity),
    db: AsyncSession = Depends(get_db),
):
    svc = InvitationService(db)
    try:
        await svc.revoke_invite(token, identity.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
