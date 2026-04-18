from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


FlagStage = Literal["dev", "production", "all"]
FlagStatus = Literal["draft", "active", "paused", "deprecated", "archived"]
TargetType = Literal["all", "user", "tenant"]


class FeatureFlagUpsert(BaseModel):
    key: str = Field(min_length=2, max_length=120)
    owner: str = Field(min_length=2, max_length=120)
    status: FlagStatus = "draft"
    description: str = Field(default="")
    stage: FlagStage = "dev"
    default_enabled: bool = False
    allow_debug_events: bool = False
    fail_mode: Literal["open", "closed"] = "closed"

    @field_validator("key")
    @classmethod
    def validate_flag_key_snake_case(cls, value: str) -> str:
        import re

        normalized = value.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,119}", normalized):
            raise ValueError(
                "Feature flag key must use snake_case: lowercase letters, digits, underscores; must start with a letter."
            )
        return normalized


class FeatureFlagPatch(BaseModel):
    owner: str | None = Field(default=None, min_length=2, max_length=120)
    status: FlagStatus | None = None
    description: str | None = None
    stage: FlagStage | None = None
    default_enabled: bool | None = None
    allow_debug_events: bool | None = None
    fail_mode: Literal["open", "closed"] | None = None


class FeatureFlagOut(BaseModel):
    id: UUID
    key: str
    owner: str
    status: str
    description: str
    stage: str
    default_enabled: bool
    allow_debug_events: bool
    fail_mode: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RuleCondition(BaseModel):
    attribute: str = Field(min_length=1, max_length=60)
    op: Literal["eq", "neq", "in", "contains", "startswith", "endswith"] = "eq"
    value: Any


class FeatureFlagRuleCreate(BaseModel):
    priority: int = 100
    enabled: bool = True
    rule_type: Literal["targeting", "rollout", "experiment"] = "targeting"
    match_operator: Literal["all", "any"] = "all"
    conditions: list[RuleCondition] = Field(default_factory=list)
    rollout_percentage: int | None = Field(default=None, ge=0, le=100)
    variant: str | None = Field(default=None, max_length=80)


class FeatureFlagRulePatch(BaseModel):
    priority: int | None = None
    enabled: bool | None = None
    rule_type: Literal["targeting", "rollout", "experiment"] | None = None
    match_operator: Literal["all", "any"] | None = None
    conditions: list[RuleCondition] | None = None
    rollout_percentage: int | None = Field(default=None, ge=0, le=100)
    variant: str | None = Field(default=None, max_length=80)


class FeatureFlagRuleOut(BaseModel):
    id: UUID
    flag_id: UUID
    priority: int
    enabled: bool
    rule_type: str
    match_operator: str
    conditions: list[dict]
    rollout_percentage: int | None
    variant: str | None
    created_at: datetime
    updated_at: datetime


class FeatureFlagTargetCreate(BaseModel):
    target_type: TargetType
    target_key: str = Field(min_length=1, max_length=191)
    stage: Literal["any", "dev", "production"] = "any"
    enabled: bool = True
    variant: str | None = Field(default=None, max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeatureFlagTargetPatch(BaseModel):
    target_type: TargetType | None = None
    target_key: str | None = Field(default=None, min_length=1, max_length=191)
    stage: Literal["any", "dev", "production"] | None = None
    enabled: bool | None = None
    variant: str | None = Field(default=None, max_length=80)
    metadata: dict[str, Any] | None = None


class FeatureFlagTargetOut(BaseModel):
    id: UUID
    flag_id: UUID
    target_type: str
    target_key: str
    stage: str
    enabled: bool
    variant: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class FeatureFlagVariantCreate(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    weight: int = Field(ge=0, le=100)
    description: str = ""


class FeatureFlagVariantOut(BaseModel):
    id: UUID
    flag_id: UUID
    key: str
    weight: int
    description: str
    created_at: datetime
    updated_at: datetime


class FeatureEvaluationPreviewRequest(BaseModel):
    user_id: UUID | None = None
    tenant_id: UUID | None = None
    traits: dict[str, Any] = Field(default_factory=dict)
    stage: FlagStage = "dev"


class FeatureEvaluationResult(BaseModel):
    key: str
    enabled: bool
    variant: str | None = None
    decision_source: str
    cache_hit: bool = False
    reason: str | None = None


class FeatureFlagMetricsPoint(BaseModel):
    bucket_start: datetime
    on_count: int
    off_count: int
    usage_count: int
    variant_counts: dict[str, int]


class FeatureFlagMetricsResponse(BaseModel):
    flag_key: str
    dimension_key: str
    dimension_value: str
    granularity: str
    points: list[FeatureFlagMetricsPoint]
