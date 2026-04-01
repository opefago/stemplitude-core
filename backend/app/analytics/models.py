"""Pre-aggregated tenant analytics (daily grain, optional dimensional slices)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenantAnalyticsDaily(Base):
    """One row per tenant, UTC calendar day, and dimension slice."""

    __tablename__ = "tenant_analytics_daily"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "bucket_date",
            "dimension",
            "dimension_key",
            name="uq_tenant_analytics_daily_dim",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bucket_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    dimension: Mapped[str] = mapped_column(String(20), nullable=False)
    # Stable string key for the dimension value: UUID hex, or "_" for tenant-wide "all".
    dimension_key: Mapped[str] = mapped_column(String(40), nullable=False)

    enrolled_students: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    active_students: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lesson_completions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lab_completions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lesson_progress_updates: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lab_progress_updates: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    assignments_submitted: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    assignments_saved: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    assignments_on_time: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    assignments_late: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    attendance_present: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    attendance_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    presence_records: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    median_lesson_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    median_lab_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    mean_lesson_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    mean_lab_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    assignments_graded: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    median_assignment_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    mean_assignment_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    mean_rubric_compliance: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
