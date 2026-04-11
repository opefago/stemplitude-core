"""email_suppressions: unique (email, scope) for global rows so deliverability + opt-out can coexist.

Revision ID: 037_suppr_scope_uniq
Revises: 036_email_suppressions
"""

from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "037_suppr_scope_uniq"
down_revision: Union[str, None] = "036_email_suppressions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_tenant")
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_global")
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_global_scope ON email_suppressions "
        "(email_normalized, scope) WHERE tenant_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_tenant_scope ON email_suppressions "
        "(email_normalized, tenant_id, scope) WHERE tenant_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_tenant_scope")
    op.execute("DROP INDEX IF EXISTS uq_email_suppressions_email_global_scope")
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_global ON email_suppressions "
        "(email_normalized) WHERE tenant_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_email_suppressions_email_tenant ON email_suppressions "
        "(email_normalized, tenant_id) WHERE tenant_id IS NOT NULL"
    )
