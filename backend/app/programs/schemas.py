"""Program schemas."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProgramBase(BaseModel):
    """Base program schema."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the program.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Optional longer description of the program's content and goals.",
    )
    is_active: bool = Field(
        True,
        description="Whether the program is currently active and visible to users.",
    )
    start_date: date | None = Field(
        None,
        description="Optional term start date. Classes under this program inherit the term.",
    )
    end_date: date | None = Field(
        None,
        description="Optional term end date. Must be on or after start_date when both are set.",
    )

    @model_validator(mode="after")
    def _validate_date_range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ProgramCreate(ProgramBase):
    """Schema for creating a program."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Robotics Fundamentals",
                    "description": "Introduction to robotics and programming",
                    "is_active": True,
                }
            ]
        }
    )


class ProgramUpdate(BaseModel):
    """Schema for updating a program."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Updated display name of the program.",
    )
    description: str | None = Field(
        None,
        max_length=1000,
        description="Updated description of the program's content and goals.",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the program is currently active and visible to users.",
    )
    start_date: date | None = Field(
        None,
        description="Optional term start date.",
    )
    end_date: date | None = Field(
        None,
        description="Optional term end date.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Robotics Fundamentals",
                    "description": "Introduction to robotics and programming",
                    "is_active": True,
                }
            ]
        }
    )


class ProgramResponse(ProgramBase):
    """Program response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the program.")
    tenant_id: UUID = Field(..., description="Tenant (organization) that owns the program.")
    created_at: datetime = Field(..., description="Timestamp when the program was created.")
    updated_at: datetime = Field(..., description="Timestamp when the program was last updated.")


class ProgramBulkLinkCurriculaRequest(BaseModel):
    """Bulk attach curricula to a program."""

    curriculum_ids: list[UUID] = Field(default_factory=list, description="Curriculum IDs to attach.")


class ProgramBulkLinkCurriculaResponse(BaseModel):
    """Bulk attach summary."""

    updated_count: int = Field(..., description="Number of curricula updated.")
