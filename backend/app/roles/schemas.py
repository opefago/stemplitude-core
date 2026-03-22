from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoleCreate(BaseModel):
    """Create a custom role within a tenant."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Teaching Assistant",
                    "slug": "teaching-assistant",
                },
            ]
        }
    )

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name of the role",
        examples=["Teaching Assistant"],
    )
    slug: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="URL-safe identifier (lowercase, hyphens)",
        examples=["teaching-assistant"],
    )


class RoleUpdate(BaseModel):
    """Update role properties."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Senior Teaching Assistant",
                    "slug": "senior-teaching-assistant",
                    "is_active": True,
                },
            ]
        }
    )

    name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Display name of the role",
    )
    slug: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="URL-safe identifier",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the role is active and assignable",
    )


class PermissionResponse(BaseModel):
    """Permission response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Permission UUID")
    resource: str = Field(
        ...,
        description="Resource or domain (e.g. students, courses)",
    )
    action: str = Field(
        ...,
        description="Action allowed (e.g. create, read, update, delete)",
    )
    description: str | None = Field(
        None,
        description="Human-readable description of the permission",
    )


class RoleResponse(BaseModel):
    """Role response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Role UUID")
    tenant_id: UUID | None = Field(
        None,
        description="Tenant UUID (null for system-wide roles)",
    )
    name: str = Field(..., description="Display name of the role")
    slug: str = Field(..., description="URL-safe identifier")
    is_system: bool = Field(
        ...,
        description="True if this is a built-in system role",
    )
    is_active: bool = Field(
        ...,
        description="Whether the role is active and assignable",
    )


class RoleWithPermissionsResponse(RoleResponse):
    """Role with its assigned permissions."""

    permissions: list[PermissionResponse] = Field(
        default_factory=list,
        description="List of permissions assigned to this role",
    )


class AssignPermissionsRequest(BaseModel):
    """Assign permissions to a role (replaces existing permissions)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "permission_ids": [
                        "880e8400-e29b-41d4-a716-446655440001",
                        "880e8400-e29b-41d4-a716-446655440002",
                    ],
                },
            ]
        }
    )

    permission_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of permission UUIDs to assign to the role",
    )
