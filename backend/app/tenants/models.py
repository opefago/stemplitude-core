import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="center")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    settings: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    billing_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="live")
    billing_email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    stripe_connect_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    member_billing_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    require_member_billing_for_access: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_connect_charges_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_connect_payouts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_connect_details_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    member_billing_application_fee_bps: Mapped[int] = mapped_column(Integer, default=0)
    member_billing_application_fee_use_platform_default: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_tenant"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class TenantLabSetting(Base):
    __tablename__ = "tenant_lab_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lab_type", name="uq_tenant_lab_setting"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lab_type: Mapped[str] = mapped_column(String(50), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TenantHierarchy(Base):
    """Strictly two-level parent→child relationship between tenants.
    billing_mode controls whether the child uses the parent's license or its own.
    seat_allocations optionally caps seats for centrally-billed children.
    """

    __tablename__ = "tenant_hierarchy"
    __table_args__ = (
        UniqueConstraint("child_tenant_id", name="uq_hierarchy_child"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    child_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    billing_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="central"
    )
    seat_allocations: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SupportAccessGrant(Base):
    __tablename__ = "support_access_grants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    granted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    support_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    reason: Mapped[str | None] = mapped_column(String(500))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
