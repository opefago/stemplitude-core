import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=120)
def refresh_oauth_tokens_task(self, connection_id: str):
    """Refresh OAuth tokens for connections nearing expiry."""
    logger.info("refresh_oauth_tokens_task started connection_id=%s", connection_id)
    from uuid import UUID
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.integrations.models import OAuthConnection

    async def _refresh():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            result = await db.execute(
                select(OAuthConnection).where(
                    OAuthConnection.id == UUID(connection_id),
                    OAuthConnection.is_active == True,
                )
            )
            conn = result.scalar_one_or_none()
            if not conn or not conn.refresh_token_enc:
                return

            # TODO: Dispatch to provider-specific token refresh
            # provider_client = get_provider(conn.provider)
            # new_tokens = await provider_client.refresh_token(conn.refresh_token_enc)
            # conn.access_token_enc = encrypt(new_tokens["access_token"])
            # conn.token_expires_at = new_tokens["expires_at"]
            # await db.commit()

    try:
        run_async_db(_refresh)
        logger.info("refresh_oauth_tokens_task completed connection_id=%s", connection_id)
    except Exception as exc:
        logger.error("refresh_oauth_tokens_task failed connection_id=%s: %s", connection_id, exc)
        raise self.retry(exc=exc)


@celery_app.task
def create_meeting_task(classroom_id: str, provider: str):
    """Create an external meeting for a classroom via the integration provider."""
    logger.info("create_meeting_task started classroom_id=%s provider=%s", classroom_id, provider)
    try:
        # TODO: Implement meeting creation via provider API
        logger.info("create_meeting_task completed classroom_id=%s provider=%s", classroom_id, provider)
    except Exception as exc:
        logger.error("create_meeting_task failed classroom_id=%s provider=%s: %s", classroom_id, provider, exc)
        raise


@celery_app.task
def sync_calendar_task(connection_id: str, classroom_id: str, action: str = "create"):
    """Sync classroom schedule to instructor's connected calendar."""
    logger.info("sync_calendar_task started connection_id=%s classroom_id=%s action=%s", connection_id, classroom_id, action)
    try:
        # TODO: Implement calendar sync
        logger.info("sync_calendar_task completed connection_id=%s classroom_id=%s action=%s", connection_id, classroom_id, action)
    except Exception as exc:
        logger.error("sync_calendar_task failed connection_id=%s classroom_id=%s: %s", connection_id, classroom_id, exc)
        raise
