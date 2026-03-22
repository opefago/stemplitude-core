"""Add notification action metadata fields.

Revision ID: 016
Revises: 015
"""

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("action_path", sa.String(length=500), nullable=True))
    op.add_column("notifications", sa.Column("action_label", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "action_label")
    op.drop_column("notifications", "action_path")
