"""trial_grants.user_id nullable + ON DELETE SET NULL (preserve grant when user deleted).

Revision ID: 034_trial_grants_user_set_null
Revises: 033_trial_grants
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "034_trial_grants_user_set_null"
down_revision: Union[str, None] = "033_trial_grants"
branch_labels = None
depends_on = None

_TRIAL_GRANTS_USER_FK = "trial_grants_user_id_fkey"


def _user_fk_constraint_name() -> str:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for fk in insp.get_foreign_keys("trial_grants"):
        cols = list(fk.get("constrained_columns") or ())
        if fk.get("referred_table") == "users" and cols == ["user_id"]:
            name = fk.get("name")
            if name:
                return name
    raise RuntimeError("Could not find foreign key trial_grants.user_id -> users.id")


def upgrade() -> None:
    op.drop_constraint(_user_fk_constraint_name(), "trial_grants", type_="foreignkey")
    op.alter_column(
        "trial_grants",
        "user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.create_foreign_key(
        _TRIAL_GRANTS_USER_FK,
        "trial_grants",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM trial_grants WHERE user_id IS NULL"))
    op.drop_constraint(_TRIAL_GRANTS_USER_FK, "trial_grants", type_="foreignkey")
    op.alter_column(
        "trial_grants",
        "user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.create_foreign_key(
        _TRIAL_GRANTS_USER_FK,
        "trial_grants",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
