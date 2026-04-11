"""Celery tasks for tenant member billing (renewal reminders)."""

import logging
from datetime import datetime, timedelta, timezone

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def member_billing_renewal_reminders():
    """Email payers ~3 days before subscription period end (fallback if webhooks missed)."""
    logger.info("member_billing_renewal_reminders started")

    async def _run():
        import app.database as db_mod

        from app.member_billing.repository import MemberBillingRepository
        from app.tenants.models import Tenant
        from app.users.models import User

        now = datetime.now(timezone.utc)
        start = now + timedelta(days=2)
        end = now + timedelta(days=4)
        async with db_mod.async_session_factory() as db:
            repo = MemberBillingRepository(db)
            subs = await repo.subscriptions_renewing_between(start, end)
            for ms in subs:
                t = await db.get(Tenant, ms.tenant_id)
                if not t or not t.member_billing_enabled or not ms.payer_user_id:
                    continue
                user = await db.get(User, ms.payer_user_id)
                if not user or not user.email:
                    continue
                try:
                    celery_app.send_task(
                        "email.send",
                        kwargs={
                            "recipient": user.email,
                            "subject": "Membership renews soon",
                            "body": (
                                "Your student membership renews in a few days. "
                                "If you use automatic payments, no action is needed."
                            ),
                            "tenant_id": str(ms.tenant_id),
                            "route_key": "member_billing.reminder",
                        },
                    )
                except Exception:
                    logger.exception("renewal reminder queue failed sub=%s", ms.id)

    try:
        run_async_db(_run)
        logger.info("member_billing_renewal_reminders completed")
    except Exception as exc:
        logger.error("member_billing_renewal_reminders failed: %s", exc)
        raise


@celery_app.task
def member_billing_reconcile_checkout_sessions():
    """Backfill member billing rows if Connect ``checkout.session.completed`` webhooks were missed."""
    logger.info("member_billing_reconcile_checkout_sessions started")

    async def _run():
        import app.database as db_mod

        from app.member_billing.checkout_completion import reconcile_stale_member_checkouts

        async with db_mod.async_session_factory() as db:
            summary = await reconcile_stale_member_checkouts(db)
            logger.info("member_billing_reconcile_checkout_sessions %s", summary)

    try:
        run_async_db(_run)
    except Exception as exc:
        logger.error("member_billing_reconcile_checkout_sessions failed: %s", exc)
        raise
