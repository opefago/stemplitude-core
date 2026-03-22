import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    price_monthly: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_yearly: Mapped[float | None] = mapped_column(Numeric(10, 2))
    stripe_price_id_monthly: Mapped[str | None] = mapped_column(String(100))
    stripe_price_id_yearly: Mapped[str | None] = mapped_column(String(100))
    trial_days: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    features: Mapped[list["PlanFeature"]] = relationship(
        "PlanFeature", back_populates="plan", cascade="all, delete-orphan"
    )
    limits: Mapped[list["PlanLimit"]] = relationship(
        "PlanLimit", back_populates="plan", cascade="all, delete-orphan"
    )


class PlanFeature(Base):
    __tablename__ = "plan_features"
    __table_args__ = (
        UniqueConstraint("plan_id", "feature_key", name="uq_plan_feature"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    feature_key: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    plan: Mapped["Plan"] = relationship("Plan", back_populates="features")


class PlanLimit(Base):
    __tablename__ = "plan_limits"
    __table_args__ = (
        UniqueConstraint("plan_id", "limit_key", name="uq_plan_limit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    limit_key: Mapped[str] = mapped_column(String(100), nullable=False)
    limit_value: Mapped[int] = mapped_column(Integer, nullable=False)

    plan: Mapped["Plan"] = relationship("Plan", back_populates="limits")
