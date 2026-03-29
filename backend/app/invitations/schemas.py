from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class CreateUserInviteRequest(BaseModel):
    email: EmailStr
    role_id: UUID
    first_name: Optional[str] = None
    personal_message: Optional[str] = None


class CreateParentInviteRequest(BaseModel):
    email: EmailStr
    student_ids: list[UUID]
    first_name: Optional[str] = None


class InvitationResponse(BaseModel):
    id: UUID
    token: str
    invite_type: str
    email: str
    status: str
    expires_at: datetime
    created_at: datetime
    accepted_at: Optional[datetime] = None
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    student_names: Optional[list[str]] = None
    invite_link: str

    model_config = {"from_attributes": True}


class InvitationListResponse(BaseModel):
    items: list[InvitationResponse]
    total: int


class ValidateInviteResponse(BaseModel):
    token: str
    invite_type: str
    email: str
    tenant_name: str
    tenant_id: UUID
    inviter_name: str
    role_name: Optional[str] = None
    student_names: Optional[list[str]] = None
    expires_at: datetime
    status: str


class AcceptInviteResponse(BaseModel):
    message: str
    tenant_id: UUID
    invite_type: str
