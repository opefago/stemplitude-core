"""SendGrid email provider."""

import base64

import httpx

from app.config import settings

from .base import BaseEmailProvider


class SendGridProvider(BaseEmailProvider):
    """SendGrid email provider."""

    provider_name = "sendgrid"

    def __init__(self, config: dict):
        self.api_key = config.get("api_key", "")
        self.sender_email = config.get("sender_email") or settings.EMAIL_DEFAULT_SENDER
        self.base_url = config.get("base_url", "https://api.sendgrid.com")

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
        """Send email via SendGrid API."""
        if not self.api_key:
            return False, None, "SendGrid api_key is missing"
        recipients = to if isinstance(to, list) else [to]
        payload: dict = {
            "personalizations": [
                {
                    "to": [{"email": recipient} for recipient in recipients],
                }
            ],
            "from": {"email": from_email or self.sender_email},
            "subject": subject,
            "content": [],
        }
        if body_text:
            payload["content"].append({"type": "text/plain", "value": body_text})
        if body_html:
            payload["content"].append({"type": "text/html", "value": body_html})
        if not payload["content"]:
            payload["content"].append({"type": "text/plain", "value": ""})
        if reply_to:
            payload["reply_to"] = {"email": reply_to}
        if extra_headers:
            payload["headers"] = {k: v for k, v in extra_headers.items() if v}
        if attachments:
            payload["attachments"] = [
                {
                    "content": base64.b64encode(a.content_bytes).decode("ascii"),
                    "type": a.content_type,
                    "filename": a.filename,
                    "disposition": "attachment",
                }
                for a in attachments
            ]

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{self.base_url.rstrip('/')}/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code in {200, 202}:
            message_id = response.headers.get("x-message-id")
            return True, message_id, None
        return False, None, response.text

