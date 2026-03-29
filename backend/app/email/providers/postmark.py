"""Postmark email provider."""

import base64

import httpx

from app.config import settings

from .base import BaseEmailProvider


class PostmarkProvider(BaseEmailProvider):
    """Postmark email provider."""

    provider_name = "postmark"

    def __init__(self, config: dict):
        self.server_token = config.get("server_token", "")
        self.sender_email = config.get("sender_email") or settings.EMAIL_DEFAULT_SENDER

    async def send(
        self,
        *,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
        attachments=None,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[bool, str | None, str | None]:
        """Send email via Postmark API."""
        token = (self.server_token or "").strip()
        if not token:
            return False, None, "Postmark server_token is missing"
        recipients = to if isinstance(to, list) else [to]
        if len(recipients) != 1:
            return False, None, "Postmark single-message API supports one recipient; use batch for multiple"
        payload: dict = {
            "From": from_email or self.sender_email,
            "To": recipients[0],
            "Subject": subject,
            "TextBody": body_text or "",
            "HtmlBody": body_html or body_text or "",
        }
        if reply_to:
            payload["ReplyTo"] = reply_to
        if attachments:
            payload["Attachments"] = [
                {
                    "Name": a.filename,
                    "Content": base64.b64encode(a.content_bytes).decode("ascii"),
                    "ContentType": a.content_type,
                }
                for a in attachments
            ]
        if extra_headers:
            payload["Headers"] = [{"Name": k, "Value": v} for k, v in extra_headers.items() if v]

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.postmarkapp.com/email",
                headers={
                    "X-Postmark-Server-Token": token,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code == 200:
            try:
                data = response.json()
            except Exception:
                data = {}
            return True, data.get("MessageID") or data.get("MessageId"), None
        try:
            err = response.json()
            detail = err.get("Message") or err.get("ErrorCode") or response.text
        except Exception:
            detail = response.text
        return False, None, str(detail)[:500]
