"""Email file attachments (JSON-safe for Celery ``json`` serializer)."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Sequence


@dataclass(frozen=True)
class EmailAttachment:
    """Single attachment: arbitrary bytes (PDF, images, ICS, etc.) plus filename and MIME type."""

    filename: str
    content_type: str
    content_bytes: bytes

    @classmethod
    def from_utf8_text(cls, *, filename: str, content_type: str, text: str) -> EmailAttachment:
        """Build from a Unicode string (e.g. ICS, CSV snippet)."""
        return cls(
            filename=filename,
            content_type=content_type,
            content_bytes=(text or "").encode("utf-8"),
        )


def attachments_to_task_payload(
    attachments: Sequence[EmailAttachment],
) -> list[dict[str, str]] | None:
    """Serialize for the ``email.send`` Celery task (JSON)."""
    if not attachments:
        return None
    out: list[dict[str, str]] = []
    for a in attachments:
        fn = (a.filename or "").strip()
        if not fn:
            continue
        out.append(
            {
                "filename": fn,
                "content_type": (a.content_type or "application/octet-stream").strip(),
                "content_base64": base64.b64encode(a.content_bytes).decode("ascii"),
            }
        )
    return out or None


def attachments_from_task_payload(raw: Any) -> list[EmailAttachment]:
    """Rebuild from Celery JSON payload; drops invalid entries."""
    if not raw or not isinstance(raw, list):
        return []
    out: list[EmailAttachment] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        fn = str(item.get("filename") or "").strip()
        b64 = item.get("content_base64")
        if not fn or not isinstance(b64, str) or not b64.strip():
            continue
        ct = str(item.get("content_type") or "application/octet-stream").strip()
        try:
            raw_bytes = base64.b64decode(b64.encode("ascii"), validate=False)
        except (ValueError, TypeError):
            continue
        out.append(EmailAttachment(filename=fn, content_type=ct, content_bytes=raw_bytes))
    return out
