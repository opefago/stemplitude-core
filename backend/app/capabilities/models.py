import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Capability(Base):
    __tablename__ = "capabilities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), index=True)
    description: Mapped[str | None] = mapped_column(String(500))

    rules: Mapped[list["CapabilityRule"]] = relationship(
        "CapabilityRule", back_populates="capability", cascade="all, delete-orphan"
    )


class CapabilityRule(Base):
    __tablename__ = "capability_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("capabilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_required: Mapped[str | None] = mapped_column(String(100))
    required_feature: Mapped[str | None] = mapped_column(String(100))
    seat_type: Mapped[str | None] = mapped_column(String(50))
    limit_key: Mapped[str | None] = mapped_column(String(100))

    capability: Mapped["Capability"] = relationship("Capability", back_populates="rules")
