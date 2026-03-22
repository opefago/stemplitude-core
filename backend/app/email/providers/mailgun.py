"""Mailgun email provider."""

from .base import BaseEmailProvider


class MailgunProvider(BaseEmailProvider):
    """Mailgun email provider."""

    provider_name = "mailgun"

    def __init__(self, config: dict):
        self.api_key = config.get("api_key", "")
        self.domain = config.get("domain", "")

    async def send(
        self,
        *,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
    ) -> tuple[bool, str | None, str | None]:
        """Send email via Mailgun API."""
        # TODO: Implement actual Mailgun API call
        # import httpx
        # recipients = to if isinstance(to, list) else [to]
        # async with httpx.AsyncClient() as client:
        #     response = await client.post(
        #         f"https://api.mailgun.net/v3/{self.domain}/messages",
        #         auth=("api", self.api_key),
        #         data={
        #             "from": from_email or f"noreply@{self.domain}",
        #             "to": recipients,
        #             "subject": subject,
        #             "text": body_text,
        #             "html": body_html,
        #         },
        #     )
        #     if response.status_code == 200:
        #         data = response.json()
        #         return True, data.get("id"), None
        #     return False, None, response.text
        return False, None, "Mailgun provider not implemented"
