import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def process_stripe_webhook_task(event_type: str, event_data: dict):
    """Process Stripe webhook events asynchronously.

    Handles: checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid,
    invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted

    Platform checkout fulfillment matches the HTTP webhook handler (``subscriptions/router.py``).
    """
    logger.info("process_stripe_webhook_task started event_type=%s", event_type)
    async def _process():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            if event_type in (
                "checkout.session.completed",
                "checkout.session.async_payment_succeeded",
            ):
                await _handle_checkout_session_for_fulfillment(db, event_data)
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


async def _handle_checkout_session_for_fulfillment(db, data: dict):
    """Provision tenant subscription + license (same logic as HTTP Stripe webhook)."""
    from app.subscriptions.stripe_checkout_fulfillment import (
        checkout_session_view_from_dict,
        fulfill_checkout_session_webhook,
    )

    session = checkout_session_view_from_dict(data)
    ok = await fulfill_checkout_session_webhook(db, session)
    if ok:
        await db.commit()
        logger.info("checkout session fulfillment committed (async job)")
    else:
        await db.rollback()


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
    """Sync subscription from Stripe after a failed invoice payment (includes period fields)."""
    from sqlalchemy import select

    from app.subscriptions.license_sync import sync_license_from_subscription
    from app.subscriptions.models import Subscription
    from app.subscriptions.stripe_client import retrieve_subscription
    from app.subscriptions.stripe_invoice_sync import stripe_invoice_subscription_id
    from app.subscriptions.stripe_subscription_sync import sync_local_subscription_from_stripe_payload

    sid = stripe_invoice_subscription_id(data)
    if not sid:
        return

    stripe_sub = retrieve_subscription(sid)
    if stripe_sub:
        sub = await sync_local_subscription_from_stripe_payload(db, stripe_sub)
        if sub:
            await db.commit()
        logger.warning("invoice.payment_failed synced from Stripe subscription_id=%s", sid)
        return

    result = await db.execute(select(Subscription).where(Subscription.stripe_subscription_id == sid))
    subscription = result.scalar_one_or_none()
    if subscription:
        subscription.status = "past_due"
        await sync_license_from_subscription(db, subscription)
        await db.commit()
        logger.warning("invoice.payment_failed (retrieve failed) marked past_due subscription_id=%s", sid)


async def _handle_subscription_updated(db, data):
    """Sync subscription row + license from Stripe (status, billing period, trial)."""
    from app.subscriptions.stripe_subscription_sync import sync_local_subscription_from_stripe_payload

    stripe_sub_id = data.get("id")
    if not stripe_sub_id:
        return

    sub = await sync_local_subscription_from_stripe_payload(db, data)
    if sub:
        await db.commit()
        logger.info(
            "customer.subscription.updated synced local subscription_id=%s status=%s",
            stripe_sub_id,
            sub.status,
        )
    else:
        logger.warning(
            "customer.subscription.updated: no local row for stripe subscription_id=%s",
            stripe_sub_id,
        )


async def _handle_subscription_deleted(db, data):
    """Apply final Stripe subscription payload (usually canceled) and refresh license."""
    from app.subscriptions.stripe_subscription_sync import sync_local_subscription_from_stripe_payload

    stripe_sub_id = data.get("id")
    if not stripe_sub_id:
        return

    sub = await sync_local_subscription_from_stripe_payload(db, data)
    if sub:
        await db.commit()
        logger.info(
            "customer.subscription.deleted synced subscription_id=%s status=%s",
            stripe_sub_id,
            sub.status,
        )
    else:
        logger.warning(
            "customer.subscription.deleted: no local row for stripe subscription_id=%s",
            stripe_sub_id,
        )
