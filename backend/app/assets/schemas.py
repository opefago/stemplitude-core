"""Asset schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.admin.schemas import GlobalAssetResponse

__all__ = ["AssetResponse", "AssetUpdate", "AssetLibraryResponse", "GlobalAssetResponse"]


class AssetResponse(BaseModel):
    """Asset response schema."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(..., description="Unique identifier for the asset.")
    tenant_id: UUID = Field(..., description="ID of the tenant that owns the asset.")
    owner_id: UUID = Field(..., description="ID of the user or student who owns the asset.")
    owner_type: str = Field(
        ...,
        description="Type of owner: 'user', 'student', or 'tenant'.",
    )
    asset_type: str = Field(
        ...,
        description="Type of asset: 'sprite', 'sound', 'background', etc.",
    )
    name: str = Field(..., description="Display name for the asset.")
    blob_key: str = Field(..., description="Storage key for the asset file.")
    blob_url: str | None = Field(
        None,
        description="Public URL to access the asset file.",
    )
    mime_type: str | None = Field(
        None,
        description="MIME type of the asset file.",
    )
    file_size: int | None = Field(
        None,
        description="Size of the asset file in bytes.",
    )
    metadata_: dict | None = Field(
        None,
        alias="metadata",
        description="Additional metadata as key-value pairs.",
    )
    lab_type: str | None = Field(
        None,
        description="Lab type this asset belongs to (e.g., 'game_maker', '3d_designer').",
    )
    thumbnail_url: str | None = Field(
        None,
        description="URL to a generated thumbnail preview of the asset.",
    )
    is_global: bool = Field(
        ...,
        description="Whether this is a global (shared) asset.",
    )
    is_active: bool = Field(
        ...,
        description="Whether the asset is active and visible.",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the asset was created.",
    )


class AssetUpdate(BaseModel):
    """Asset update schema."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "My Robot Design v2",
                    "lab_type": "3d_designer",
                }
            ]
        }
    )

    name: str | None = Field(
        None,
        max_length=200,
        description="Display name for the asset.",
    )
    lab_type: str | None = Field(
        None,
        max_length=50,
        description="Lab type this asset belongs to (e.g., 'game_maker', '3d_designer').",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the asset is active and visible.",
    )


class AssetListResponse(BaseModel):
    """Paginated list of assets."""

    items: list[AssetResponse] = Field(..., description="Asset records.")
    total: int = Field(..., description="Total count matching the filters.")


class AssetLibraryResponse(BaseModel):
    """Asset library response (own + shared + global)."""

    own: list[AssetResponse] = Field(
        ...,
        description="Assets owned by the current user.",
    )
    shared: list[AssetResponse] = Field(
        ...,
        description="Assets shared with the current user.",
    )
    global_assets: list[GlobalAssetResponse] = Field(
        ...,
        description="Global assets available to all users.",
    )
