"""Add command_audit_log table + attach audit triggers to plans tables.

Revision ID: 004_command_audit_log
Revises: 003_global_rbac
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "004_command_audit_log"
down_revision: Union[str, None] = "003_global_rbac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PLANS_TABLES_TO_AUDIT = ["plans", "plan_features", "plan_limits", "license_features", "license_limits"]


def upgrade() -> None:
    # --- command_audit_log table ---
    op.create_table(
        "command_audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("command", sa.String(512), nullable=False),
        sa.Column("domain", sa.String(64), nullable=False, index=True),
        sa.Column("action", sa.String(64), nullable=False, index=True),
        sa.Column("params", JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, index=True),
        sa.Column("result_summary", sa.Text, nullable=True),
        sa.Column("result_data", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            index=True,
        ),
    )

    # --- Attach audit triggers to plans/license sub-tables that were missed in 001 ---
    for tbl in _PLANS_TABLES_TO_AUDIT:
        op.execute(f"""
            CREATE TRIGGER audit_{tbl}
            AFTER INSERT OR UPDATE OR DELETE ON {tbl}
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
        """)
        op.execute(f"""
            CREATE TRIGGER audit_{tbl}_truncate
            BEFORE TRUNCATE ON {tbl}
            FOR EACH STATEMENT EXECUTE FUNCTION audit_trigger_func();
        """)


def downgrade() -> None:
    for tbl in reversed(_PLANS_TABLES_TO_AUDIT):
        op.execute(f"DROP TRIGGER IF EXISTS audit_{tbl}_truncate ON {tbl};")
        op.execute(f"DROP TRIGGER IF EXISTS audit_{tbl} ON {tbl};")
    op.drop_table("command_audit_log")
