"""Resend email provider."""

import base64

import httpx

from app.config import settings

from .base import BaseEmailProvider


class ResendProvider(BaseEmailProvider):
    """Resend email provider."""

    provider_name = "resend"

    def __init__(self, config: dict):
        self.api_key = config.get("api_key", "")
        self.sender_email = config.get("sender_email") or settings.EMAIL_DEFAULT_SENDER
        self.base_url = config.get("base_url", "https://api.resend.com")

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
        """Send email via Resend API."""
        if not self.api_key:
            return False, None, "Resend api_key is missing"
        recipients = to if isinstance(to, list) else [to]
        payload: dict = {
            "from": from_email or self.sender_email,
            "to": recipients,
            "subject": subject,
        }
        if body_html:
            payload["html"] = body_html
        if body_text:
            payload["text"] = body_text
        if reply_to:
            payload["reply_to"] = reply_to
        if extra_headers:
            payload["headers"] = {k: v for k, v in extra_headers.items() if v}
        if attachments:
            payload["attachments"] = [
                {
                    "filename": a.filename,
                    "content": base64.b64encode(a.content_bytes).decode("ascii"),
                    "content_type": a.content_type,
                }
                for a in attachments
            ]

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{self.base_url.rstrip('/')}/emails",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code in {200, 201, 202}:
            try:
                data = response.json()
            except Exception:
                data = {}
            return True, data.get("id"), None
        return False, None, response.text

