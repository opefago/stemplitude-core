import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class License(Base):
    __tablename__ = "licenses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    features: Mapped[list["LicenseFeature"]] = relationship(
        "LicenseFeature", back_populates="license", cascade="all, delete-orphan"
    )
    limits: Mapped[list["LicenseLimit"]] = relationship(
        "LicenseLimit", back_populates="license", cascade="all, delete-orphan"
    )
    seat_usages: Mapped[list["SeatUsage"]] = relationship(
        "SeatUsage", back_populates="license", cascade="all, delete-orphan"
    )


class LicenseFeature(Base):
    __tablename__ = "license_features"
    __table_args__ = (
        UniqueConstraint("license_id", "feature_key", name="uq_license_feature"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    license_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    feature_key: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    license: Mapped["License"] = relationship("License", back_populates="features")


class LicenseLimit(Base):
    __tablename__ = "license_limits"
    __table_args__ = (
        UniqueConstraint("license_id", "limit_key", name="uq_license_limit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    license_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    limit_key: Mapped[str] = mapped_column(String(100), nullable=False)
    limit_value: Mapped[int] = mapped_column(Integer, nullable=False)

    license: Mapped["License"] = relationship("License", back_populates="limits")


class SeatUsage(Base):
    __tablename__ = "seat_usage"
    __table_args__ = (
        UniqueConstraint("license_id", "seat_type", name="uq_seat_usage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    license_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seat_type: Mapped[str] = mapped_column(String(50), nullable=False)
    current_count: Mapped[int] = mapped_column(Integer, default=0)
    max_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    license: Mapped["License"] = relationship("License", back_populates="seat_usages")
