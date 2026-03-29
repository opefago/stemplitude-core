"""Inbound webhooks: bounces and complaints → ``deliverability`` suppressions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.email.sendgrid_event_verify import verify_sendgrid_event_signature
from app.email.webhook_auth import verify_shared_bearer_or_basic
from app.email.webhook_handlers import (
    decode_json_array_or_object,
    decode_json_object,
    handle_postmark_webhook,
    handle_resend_webhook,
    handle_sendgrid_webhook,
)

router = APIRouter()


@router.post("/postmark")
async def email_webhook_postmark(request: Request, db: AsyncSession = Depends(get_db)):
    """Postmark bounce + spam complaint webhook (JSON). Use HTTP Basic or Bearer in front of Postmark."""
    verify_shared_bearer_or_basic(request)
    body = await request.body()
    payload = decode_json_object(body)
    result = await handle_postmark_webhook(db, payload)
    return result


@router.post("/sendgrid")
async def email_webhook_sendgrid(request: Request, db: AsyncSession = Depends(get_db)):
    """SendGrid Event Webhook. Prefer signed webhook (``SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY``)."""
    body = await request.body()
    sig = (request.headers.get("X-Twilio-Email-Event-Webhook-Signature") or "").strip()
    ts = (request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp") or "").strip()
    pk = (settings.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY or "").strip()

    if pk:
        if not sig or not ts:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature headers")
        payload_text = body.decode("utf-8")
        if not verify_sendgrid_event_signature(
            public_key_pem_body=pk,
            payload_text=payload_text,
            signature_b64=sig,
            timestamp=ts,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")
    else:
        verify_shared_bearer_or_basic(request)

    try:
        events = decode_json_array_or_object(body)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON") from None

    result = await handle_sendgrid_webhook(db, events)
    return result


@router.post("/resend")
async def email_webhook_resend(request: Request, db: AsyncSession = Depends(get_db)):
    """Resend webhooks (Svix). Set ``RESEND_WEBHOOK_SECRET`` from the Resend dashboard."""
    body = await request.body()
    secret = (settings.RESEND_WEBHOOK_SECRET or "").strip()
    if secret:
        try:
            from svix.webhooks import Webhook, WebhookVerificationError

            wh = Webhook(secret)
            wh.verify(
                body,
                {
                    "svix-id": request.headers.get("svix-id", ""),
                    "svix-timestamp": request.headers.get("svix-timestamp", ""),
                    "svix-signature": request.headers.get("svix-signature", ""),
                },
            )
        except ImportError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Install svix package for Resend webhook verification",
            ) from e
        except WebhookVerificationError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook signature") from None
    else:
        verify_shared_bearer_or_basic(request)

    payload = decode_json_object(body)
    result = await handle_resend_webhook(db, payload)
    return result
