import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def process_stripe_webhook_task(event_type: str, event_data: dict):
    """Process Stripe webhook events asynchronously.

    Handles: checkout.session.completed, invoice.paid, invoice.payment_failed,
    customer.subscription.updated, customer.subscription.deleted
    """
    logger.info("process_stripe_webhook_task started event_type=%s", event_type)
    async def _process():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            if event_type == "checkout.session.completed":
                await _handle_checkout_completed(db, event_data)
            elif event_type == "invoice.paid":
                await _handle_invoice_paid(db, event_data)
            elif event_type == "invoice.payment_failed":
                await _handle_payment_failed(db, event_data)
            elif event_type == "customer.subscription.updated":
                await _handle_subscription_updated(db, event_data)
            elif event_type == "customer.subscription.deleted":
                await _handle_subscription_deleted(db, event_data)

    try:
        run_async_db(_process)
        logger.info("process_stripe_webhook_task completed event_type=%s", event_type)
    except Exception as exc:
        logger.error("process_stripe_webhook_task failed event_type=%s: %s", event_type, exc)
        raise


async def _handle_checkout_completed(db, data):
    """Provision subscription and license after successful checkout."""
    logger.info("checkout.session.completed subscription lifecycle")
    pass  # Handled synchronously in webhook endpoint for now


async def _handle_invoice_paid(db, data):
    """Update invoice record on successful payment."""
    from sqlalchemy import select
    from app.subscriptions.models import Invoice

    stripe_invoice_id = data.get("id")
    if not stripe_invoice_id:
        return

    result = await db.execute(
        select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if invoice:
        invoice.status = "paid"
        await db.commit()
        logger.info("invoice.paid subscription lifecycle invoice_id=%s", stripe_invoice_id)


async def _handle_payment_failed(db, data):
    """Update subscription status on failed payment."""
    from sqlalchemy import select
    from app.subscriptions.models import Subscription

    stripe_sub_id = data.get("subscription")
    if not stripe_sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = "past_due"
        await db.commit()
        logger.warning("invoice.payment_failed billing attempt failed subscription_id=%s", stripe_sub_id)


async def _handle_subscription_updated(db, data):
    """Sync subscription status changes from Stripe."""
    from sqlalchemy import select
    from app.subscriptions.models import Subscription

    stripe_sub_id = data.get("id")
    if not stripe_sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        stripe_status = data.get("status", "")
        status_map = {
            "active": "active",
            "trialing": "trialing",
            "past_due": "past_due",
            "canceled": "canceled",
            "unpaid": "past_due",
        }
        subscription.status = status_map.get(stripe_status, subscription.status)
        await db.commit()
        logger.info("customer.subscription.updated subscription lifecycle subscription_id=%s status=%s", stripe_sub_id, subscription.status)


async def _handle_subscription_deleted(db, data):
    """Mark subscription as expired when Stripe deletes it."""
    from sqlalchemy import select
    from app.subscriptions.models import Subscription

    stripe_sub_id = data.get("id")
    if not stripe_sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = "expired"
        await db.commit()
        logger.info("customer.subscription.deleted subscription lifecycle subscription_id=%s expired", stripe_sub_id)
