"""Postmark email provider."""

from .base import BaseEmailProvider


class PostmarkProvider(BaseEmailProvider):
    """Postmark email provider."""

    provider_name = "postmark"

    def __init__(self, config: dict):
        self.server_token = config.get("server_token", "")
        self.sender_email = config.get("sender_email", "noreply@stemplitude.com")

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
        """Send email via Postmark API."""
        # TODO: Implement actual Postmark API call
        # import httpx
        # async with httpx.AsyncClient() as client:
        #     response = await client.post(
        #         "https://api.postmarkapp.com/email",
        #         headers={"X-Postmark-Server-Token": self.server_token},
        #         json={
        #             "From": from_email or self.sender_email,
        #             "To": to if isinstance(to, str) else ",".join(to),
        #             "Subject": subject,
        #             "TextBody": body_text,
        #             "HtmlBody": body_html,
        #         },
        #     )
        #     if response.status_code == 200:
        #         data = response.json()
        #         return True, data.get("MessageID"), None
        #     return False, None, response.text
        return False, None, "Postmark provider not implemented"
