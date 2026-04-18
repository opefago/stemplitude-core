import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RateLimitProfileOverride(Base):
    __tablename__ = "rate_limit_profile_overrides"
    __table_args__ = (
        UniqueConstraint("scope_type", "scope_id", name="uq_rate_limit_profile_scope"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    scope_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    mode: Mapped[str] = mapped_column(String(30), nullable=False, default="profile_only")
    profile_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    custom_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    custom_window_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
