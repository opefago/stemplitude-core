import logging

from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, recipient: str, subject: str, body: str, html_body: str | None = None):
    """Send email via the multi-provider EmailService.

    Runs asynchronously via Celery to avoid blocking API responses.
    """
    logger.info("Email task started to=%s", recipient)
    import asyncio
    from app.database import async_session_factory
    from app.email.service import EmailService

    async def _send():
        async with async_session_factory() as db:
            service = EmailService(db)
            await service.send(
                recipient=recipient,
                subject=subject,
                body=body,
                html_body=html_body,
            )

    try:
        asyncio.run(_send())
        logger.info("Email task completed to=%s", recipient)
    except Exception as exc:
        logger.error("Email task send failure to=%s: %s", recipient, exc)
        self.retry(exc=exc)
