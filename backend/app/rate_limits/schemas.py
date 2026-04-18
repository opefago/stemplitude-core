from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RateLimitProfileOut(BaseModel):
    key: str
    limit: int
    window_seconds: int
    description: str | None = None


class RateLimitOverrideUpsert(BaseModel):
    scope_type: Literal["tenant", "user"]
    scope_id: UUID
    mode: Literal["profile_only", "custom_only", "profile_plus_custom"] = "profile_only"
    profile_key: str | None = Field(default=None, min_length=1, max_length=80)
    custom_limit: int | None = Field(default=None, ge=1, le=100000)
    custom_window_seconds: int | None = Field(default=None, ge=1, le=3600)
    reason: str | None = Field(default=None, max_length=500)


class RateLimitOverrideOut(BaseModel):
    id: UUID
    scope_type: Literal["tenant", "user"]
    scope_id: UUID
    scope_label: str | None = None
    scope_subtitle: str | None = None
    mode: Literal["profile_only", "custom_only", "profile_plus_custom"]
    profile_key: str | None
    custom_limit: int | None
    custom_window_seconds: int | None
    reason: str | None
    updated_by: UUID | None
    created_at: datetime
    updated_at: datetime


class RateLimitOverrideListResponse(BaseModel):
    items: list[RateLimitOverrideOut]
    total: int
    offset: int
    limit: int


class RateLimitLookupUser(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool


class RateLimitLookupTenant(BaseModel):
    id: UUID
    name: str
    slug: str
    type: str
    is_active: bool


class EffectiveRateLimitResponse(BaseModel):
    route_path: str
    route_class: str
    route_profile_key: str
    user_profile: RateLimitProfileOut | None = None
    tenant_profile: RateLimitProfileOut | None = None
    anonymous_profile: RateLimitProfileOut
    failure_mode: Literal["open", "closed"]
