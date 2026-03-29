import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_SUBJ_LOG_MAX = 80


def _log_subject(subject: str) -> str:
    s = (subject or "").replace("\n", " ").strip()
    if len(s) <= _SUBJ_LOG_MAX:
        return s
    return s[: _SUBJ_LOG_MAX - 1] + "…"


def _run_send_email_task(
    task,
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    tenant_id: str | None = None,
    route_key: str | None = None,
    attachments: list | None = None,
    list_unsubscribe_url: str | None = None,
) -> dict:
    req = task.request
    retries = getattr(req, "retries", 0) or 0
    logger.info(
        "email.send task_id=%s retries=%s to=%s subject=%r route_key=%s tenant_id=%s",
        req.id,
        retries,
        recipient,
        _log_subject(subject),
        route_key,
        tenant_id,
    )
    from app.email.attachments import attachments_from_task_payload
    from app.email.service import EmailService

    atts = attachments_from_task_payload(attachments)
    outcome: list[str | None] = [None]

    async def _send():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            service = EmailService(db)
            ok, err = await service.send(
                recipient=recipient,
                subject=subject,
                body=body,
                html_body=html_body,
                tenant_id=tenant_id,
                route_key=route_key,
                attachments=atts or None,
                list_unsubscribe_url=list_unsubscribe_url,
            )
            await db.commit()
            if not ok:
                if err in ("recipient_opted_out", "recipient_deliverability_suppressed"):
                    outcome[0] = err
                    logger.info(
                        "email.send skipped (%s) task_id=%s to=%s",
                        err,
                        req.id,
                        recipient,
                    )
                    return
                raise RuntimeError(err or "email_send_failed")
            outcome[0] = "__sent__"

    def _summary() -> dict:
        return {
            "recipient": recipient,
            "subject": _log_subject(subject),
            "route_key": route_key,
            "tenant_id": tenant_id,
        }

    try:
        run_async_db(_send)
        state = outcome[0]
        if state in ("recipient_opted_out", "recipient_deliverability_suppressed"):
            return {"outcome": "skipped", "reason": state, **_summary()}
        if state == "__sent__":
            logger.info(
                "email.send task_id=%s completed to=%s subject=%r",
                req.id,
                recipient,
                _log_subject(subject),
            )
            return {"outcome": "sent", **_summary()}
        logger.warning(
            "email.send task_id=%s finished with unexpected outcome=%r",
            req.id,
            state,
        )
        return {"outcome": "unknown", **_summary()}
    except Exception as exc:
        max_r = task.max_retries if task.max_retries is not None else 0
        logger.exception(
            "email.send task_id=%s failed to=%s subject=%r route_key=%s attempt=%s/%s: %s",
            req.id,
            recipient,
            _log_subject(subject),
            route_key,
            retries + 1,
            max_r + 1,
            exc,
        )
        raise task.retry(exc=exc)


@celery_app.task(bind=True, name="email.send", max_retries=3, default_retry_delay=60)
def send_email_task(
    self,
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    tenant_id: str | None = None,
    route_key: str | None = None,
    attachments: list | None = None,
    list_unsubscribe_url: str | None = None,
):
    """Send transactional email (Celery name: ``email.send``)."""
    return _run_send_email_task(
        self,
        recipient,
        subject,
        body,
        html_body,
        tenant_id,
        route_key,
        attachments,
        list_unsubscribe_url,
    )


@celery_app.task(
    bind=True,
    name="workers.tasks.email_tasks.send_email_task",
    max_retries=3,
    default_retry_delay=60,
)
def send_email_task_legacy_module_name(
    self,
    recipient: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    tenant_id: str | None = None,
    route_key: str | None = None,
    attachments: list | None = None,
    list_unsubscribe_url: str | None = None,
):
    """Same as :func:`send_email_task`; keeps the pre-rename Celery task name for queued messages."""
    return _run_send_email_task(
        self,
        recipient,
        subject,
        body,
        html_body,
        tenant_id,
        route_key,
        attachments,
        list_unsubscribe_url,
    )
