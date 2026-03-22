"""Add optional curriculum/program link columns.

Revision ID: 009_prog_curr_class_links
Revises: 008_platform_blob_finder
Create Date: 2026-03-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "009_prog_curr_class_links"
down_revision: Union[str, None] = "008_platform_blob_finder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("program_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_courses_program_id_programs",
        "courses",
        "programs",
        ["program_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_courses_program_id", "courses", ["program_id"])

    op.add_column("classrooms", sa.Column("curriculum_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_classrooms_curriculum_id_courses",
        "classrooms",
        "courses",
        ["curriculum_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_classrooms_curriculum_id", "classrooms", ["curriculum_id"])


def downgrade() -> None:
    op.drop_index("ix_classrooms_curriculum_id", table_name="classrooms")
    op.drop_constraint("fk_classrooms_curriculum_id_courses", "classrooms", type_="foreignkey")
    op.drop_column("classrooms", "curriculum_id")

    op.drop_index("ix_courses_program_id", table_name="courses")
    op.drop_constraint("fk_courses_program_id_programs", "courses", type_="foreignkey")
    op.drop_column("courses", "program_id")
