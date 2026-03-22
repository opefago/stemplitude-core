"""Add optional start_date and end_date to programs for term support.

Revision ID: 011_program_term_dates
Revises: 010_curr_def_labs
Create Date: 2026-03-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_program_term_dates"
down_revision: Union[str, None] = "010_curr_def_labs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("programs", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("programs", sa.Column("end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("programs", "end_date")
    op.drop_column("programs", "start_date")
