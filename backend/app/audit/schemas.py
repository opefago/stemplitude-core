"""Audit event schemas for API responses and query filters."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditEventResponse(BaseModel):
    """Single audit event record."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the audit event.")
    table_name: str = Field(..., description="Database table where the change occurred.")
    record_id: str = Field(..., description="Primary key of the affected record.")
    action: str = Field(..., description="Operation type: INSERT, UPDATE, DELETE, or TRUNCATE.")
    old_data: dict | None = Field(None, description="Row state before the change (UPDATE/DELETE only).")
    new_data: dict | None = Field(None, description="Row state after the change (INSERT/UPDATE only).")
    changed_fields: list[str] | None = Field(None, description="List of column names that changed (UPDATE only).")
    db_user: str = Field(..., description="PostgreSQL role that executed the statement.")
    app_user_id: str | None = Field(None, description="Application user ID from request context.")
    tenant_id: str | None = Field(None, description="Tenant ID from request context.")
    ip_address: str | None = Field(None, description="Client IP address from request context.")
    created_at: datetime = Field(..., description="Timestamp when the event was recorded.")


class AuditEventListResponse(BaseModel):
    """Paginated list of audit events."""

    items: list[AuditEventResponse] = Field(..., description="List of audit events.")
    total: int = Field(..., description="Total number of events matching the query.")


class AuditRetentionResult(BaseModel):
    """Result of an audit retention cleanup run."""

    deleted_count: int = Field(..., description="Number of audit events deleted.")
    cutoff_date: datetime = Field(..., description="Events older than this were removed.")
