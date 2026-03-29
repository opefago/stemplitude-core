"""Align gamification student foreign keys to students table.

Revision ID: 031_gamif_student_fk
Revises: 030_tenant_gamification_engine
Create Date: 2026-03-26 00:00:00.000000
"""

from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "031_gamif_student_fk"
down_revision: Union[str, None] = "030_tenant_gamification_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE xp_transactions
            DROP CONSTRAINT IF EXISTS xp_transactions_student_id_fkey,
            ADD CONSTRAINT xp_transactions_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE student_badges
            DROP CONSTRAINT IF EXISTS student_badges_student_id_fkey,
            ADD CONSTRAINT student_badges_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE streaks
            DROP CONSTRAINT IF EXISTS streaks_student_id_fkey,
            ADD CONSTRAINT streaks_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE shoutouts
            DROP CONSTRAINT IF EXISTS shoutouts_to_student_id_fkey,
            ADD CONSTRAINT shoutouts_to_student_id_fkey
                FOREIGN KEY (to_student_id) REFERENCES students(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE weekly_winners
            DROP CONSTRAINT IF EXISTS weekly_winners_student_id_fkey,
            ADD CONSTRAINT weekly_winners_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE xp_transactions
            DROP CONSTRAINT IF EXISTS xp_transactions_student_id_fkey,
            ADD CONSTRAINT xp_transactions_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE student_badges
            DROP CONSTRAINT IF EXISTS student_badges_student_id_fkey,
            ADD CONSTRAINT student_badges_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE streaks
            DROP CONSTRAINT IF EXISTS streaks_student_id_fkey,
            ADD CONSTRAINT streaks_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE shoutouts
            DROP CONSTRAINT IF EXISTS shoutouts_to_student_id_fkey,
            ADD CONSTRAINT shoutouts_to_student_id_fkey
                FOREIGN KEY (to_student_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        ALTER TABLE weekly_winners
            DROP CONSTRAINT IF EXISTS weekly_winners_student_id_fkey,
            ADD CONSTRAINT weekly_winners_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )
