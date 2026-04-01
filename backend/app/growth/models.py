"""ORM stubs for growth/affiliate tables used as FK targets elsewhere.

``subscriptions.affiliate_partner_id`` references ``affiliate_partners``. The table is
created by Alembic; growth billing code mostly uses raw SQL. Without this model,
SQLAlchemy cannot resolve the FK graph and raises ``NoReferencedTableError`` on flush.
"""

from __future__ import annotations

import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AffiliatePartner(Base):
    __tablename__ = "affiliate_partners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    code: Mapped[str | None] = mapped_column(String(64), nullable=True)
