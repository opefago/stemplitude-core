import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _json_col():
    return JSONB().with_variant(JSON(), "sqlite")


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    __table_args__ = (
        UniqueConstraint("key", name="uq_feature_flags_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    owner: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="dev")
    default_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_debug_events: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fail_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="closed")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FeatureFlagRule(Base):
    __tablename__ = "feature_flag_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feature_flags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rule_type: Mapped[str] = mapped_column(String(30), nullable=False, default="targeting")
    match_operator: Mapped[str] = mapped_column(String(10), nullable=False, default="all")
    conditions_json: Mapped[list[dict]] = mapped_column(_json_col(), nullable=False, default=list)
    rollout_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FeatureFlagTarget(Base):
    __tablename__ = "feature_flag_targets"
    __table_args__ = (
        UniqueConstraint(
            "flag_id",
            "target_type",
            "target_key",
            "stage",
            name="uq_feature_flag_target_scope",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feature_flags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_key: Mapped[str] = mapped_column(String(191), nullable=False)
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="any")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(_json_col(), nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FeatureFlagVariant(Base):
    __tablename__ = "feature_flag_variants"
    __table_args__ = (
        UniqueConstraint("flag_id", "key", name="uq_feature_flag_variant"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feature_flags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FeatureFlagMetricBucket(Base):
    __tablename__ = "feature_flag_metric_buckets"
    __table_args__ = (
        UniqueConstraint(
            "flag_id",
            "bucket_start",
            "bucket_granularity",
            "dimension_key",
            "dimension_value",
            name="uq_feature_flag_metric_bucket",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feature_flags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    bucket_granularity: Mapped[str] = mapped_column(String(10), nullable=False, default="minute")
    dimension_key: Mapped[str] = mapped_column(String(40), nullable=False, default="all")
    dimension_value: Mapped[str] = mapped_column(String(120), nullable=False, default="all")
    on_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    off_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    variant_counts: Mapped[dict] = mapped_column(_json_col(), nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FeatureFlagDebugEvent(Base):
    __tablename__ = "feature_flag_debug_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feature_flags.id", ondelete="SET NULL"), nullable=True, index=True
    )
    flag_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    subject_type: Mapped[str] = mapped_column(String(20), nullable=False, default="anonymous")
    subject_key: Mapped[str] = mapped_column(String(191), nullable=False, default="anonymous")
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="dev")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    decision_source: Mapped[str] = mapped_column(String(50), nullable=False, default="default")
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    traits_json: Mapped[dict] = mapped_column(_json_col(), nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )
