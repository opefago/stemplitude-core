"""AWS SES email provider."""

from .base import BaseEmailProvider


class SESProvider(BaseEmailProvider):
    """AWS SES email provider."""

    provider_name = "ses"

    def __init__(self, config: dict):
        self.region = config.get("region", "us-east-1")
        self.access_key = config.get("access_key_id", "")
        self.secret_key = config.get("secret_access_key", "")
        self.sender_email = config.get("sender_email", "")

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
        """Send email via AWS SES."""
        # TODO: Implement actual SES API call
        # import boto3
        # from botocore.exceptions import ClientError
        # client = boto3.client(
        #     "ses",
        #     region_name=self.region,
        #     aws_access_key_id=self.access_key,
        #     aws_secret_access_key=self.secret_key,
        # )
        # try:
        #     response = client.send_email(
        #         Source=from_email or self.sender_email,
        #         Destination={"ToAddresses": to if isinstance(to, list) else [to]},
        #         Message={
        #             "Subject": {"Data": subject},
        #             "Body": {
        #                 "Text": {"Data": body_text or ""},
        #                 "Html": {"Data": body_html or body_text or ""},
        #             },
        #         },
        #     )
        #     return True, response.get("MessageId"), None
        # except ClientError as e:
        #     return False, None, str(e)
        return False, None, "SES provider not implemented"
