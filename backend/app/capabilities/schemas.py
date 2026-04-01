"""Capability schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CapabilityRuleBase(BaseModel):
    """Base capability rule schema."""

    role_required: str | None = Field(
        None,
        max_length=100,
        description="Role that must be assigned to grant this capability.",
    )
    required_feature: str | None = Field(
        None,
        max_length=100,
        description="Feature that must be enabled to grant this capability.",
    )
    seat_type: str | None = Field(
        None,
        max_length=50,
        description="Seat type required (e.g. student, teacher).",
    )
    limit_key: str | None = Field(
        None,
        max_length=100,
        description="Limit key to check (e.g. max_students).",
    )


class CapabilityRuleCreate(CapabilityRuleBase):
    """Schema for creating a capability rule."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "role_required": "teacher",
                    "required_feature": "robotics_lab",
                },
            ]
        }
    )


class CapabilityRuleResponse(CapabilityRuleBase):
    """Capability rule response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the capability rule.")
    capability_id: UUID = Field(
        ...,
        description="ID of the capability this rule belongs to.",
    )


class CapabilityBase(BaseModel):
    """Base capability schema."""

    key: str = Field(
        ...,
        max_length=100,
        description="Unique identifier for the capability (e.g. access_robotics_lab).",
    )
    name: str = Field(
        ...,
        max_length=200,
        description="Human-readable name of the capability.",
    )
    category: str | None = Field(
        None,
        max_length=50,
        description="Classification category (e.g. lab, management, analytics).",
    )
    description: str | None = Field(
        None,
        max_length=500,
        description="Detailed description of what this capability grants.",
    )


class CapabilityCreate(CapabilityBase):
    """Schema for creating a capability."""

    rules: list[CapabilityRuleCreate] = Field(
        default_factory=list,
        description="Rules that determine when this capability is granted.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "key": "access_robotics_lab",
                    "name": "Access Robotics Lab",
                    "category": "lab",
                    "description": "Gate access to the robotics/MCU lab",
                    "rules": [],
                },
            ]
        }
    )


class CapabilityUpdate(BaseModel):
    """Schema for updating a capability."""

    key: str | None = Field(
        None,
        max_length=100,
        description="Unique identifier for the capability.",
    )
    name: str | None = Field(
        None,
        max_length=200,
        description="Human-readable name of the capability.",
    )
    category: str | None = Field(
        None,
        max_length=50,
        description="Classification category (e.g. lab, management, analytics).",
    )
    description: str | None = Field(
        None,
        max_length=500,
        description="Detailed description of what this capability grants.",
    )
    rules: list[CapabilityRuleCreate] | None = Field(
        None,
        description="Rules that determine when this capability is granted.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Access Robotics Lab (Updated)",
                    "category": "lab",
                    "description": "Full access to robotics and MCU lab facilities",
                },
            ]
        }
    )


class CapabilityResponse(CapabilityBase):
    """Capability response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the capability.")
    rules: list[CapabilityRuleResponse] = Field(
        default_factory=list,
        description="Rules that determine when this capability is granted.",
    )


class CapabilityCheckRequest(BaseModel):
    """Request to check a capability."""

    capability_key: str = Field(
        ...,
        max_length=100,
        description="Key of the capability to check (e.g. create_student).",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "capability_key": "create_student",
                },
            ]
        }
    )


class CapabilityCheckResponse(BaseModel):
    """Response for capability check."""

    allowed: bool = Field(
        ...,
        description="Whether the user/context is allowed to perform the capability.",
    )
    reason: str | None = Field(
        None,
        description="Human-readable reason when the capability is denied.",
    )


class LabLauncherItemResponse(BaseModel):
    """One row in the app lab launcher (student or staff)."""

    id: str = Field(..., description="Stable launcher id (e.g. circuit-maker).")
    allowed: bool = Field(..., description="Whether this lab may be opened in this workspace.")
    reason: str | None = Field(
        None,
        description="When not allowed, a short explanation (plan, org policy, etc.).",
    )


class LabLauncherResponse(BaseModel):
    """Lab launcher tiles for the current tenant and identity."""

    labs: list[LabLauncherItemResponse] = Field(default_factory=list)
