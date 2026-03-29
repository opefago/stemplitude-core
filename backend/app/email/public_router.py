"""Public unsubscribe endpoints (no auth): browser confirmation + RFC 8058 one-click POST."""

from __future__ import annotations

import logging
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.email.repository import EmailSuppressionRepository
from app.email.unsubscribe import decode_unsubscribe_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _html_page(body: str, *, ok: bool) -> str:
    brand = (settings.APP_NAME or "STEMplitude").strip()
    title = "Unsubscribe" if ok else "Link problem"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title} — {brand}</title>
<style>
body {{ font-family: system-ui, sans-serif; margin: 0; padding: 48px 20px; background: #f8fafc; color: #0f172a; }}
main {{ max-width: 520px; margin: 0 auto; background: #fff; padding: 28px 24px; border-radius: 12px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(15,23,42,0.06); }}
h1 {{ font-size: 1.25rem; margin: 0 0 12px 0; }}
p {{ margin: 0 0 12px 0; line-height: 1.5; color: #334155; font-size: 0.95rem; }}
button {{ margin-top: 8px; padding: 10px 18px; font-size: 0.95rem; border-radius: 8px;
  border: 0; background: #059669; color: #fff; font-weight: 600; cursor: pointer; }}
</style>
</head>
<body><main>
{body}
</main></body>
</html>"""


async def _apply_token(token: str | None, db: AsyncSession) -> tuple[bool, str]:
    if not (token or "").strip():
        return False, "missing_token"
    payload = decode_unsubscribe_token(token.strip())
    if not payload:
        return False, "invalid_token"
    email = (payload.get("email") or "").strip().lower()
    if not email:
        return False, "invalid_token"
    tid_raw = payload.get("tid")
    tenant_uuid: UUID | None = None
    if tid_raw:
        try:
            tenant_uuid = UUID(str(tid_raw))
        except ValueError:
            return False, "invalid_token"
    repo = EmailSuppressionRepository(db)
    await repo.record_non_transactional_suppression(
        email_normalized=email,
        tenant_id=tenant_uuid,
        source="one_click",
    )
    logger.info("email_unsubscribe recorded email=%s tenant_id=%s", email, tenant_uuid)
    return True, "ok"


@router.head("/unsubscribe")
async def unsubscribe_head(token: str | None = Query(None)):
    """Link validation without recording (some clients prefetch)."""
    if not (token or "").strip() or decode_unsubscribe_token(token.strip()) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    return Response(status_code=200)


@router.get("/unsubscribe")
async def unsubscribe_get(token: str | None = Query(None)):
    """Shows a confirm button; avoids recording on accidental link previews (GET)."""
    brand = (settings.APP_NAME or "STEMplitude").strip()
    if not (token or "").strip():
        inner = "<h1>Missing link</h1><p>This unsubscribe link is incomplete.</p>"
        return HTMLResponse(_html_page(inner, ok=False), status_code=400)
    if decode_unsubscribe_token(token.strip()) is None:
        inner = "<h1>Link expired or invalid</h1><p>Request a fresh email from the app.</p>"
        return HTMLResponse(_html_page(inner, ok=False), status_code=400)
    q = quote(token.strip(), safe="")
    inner = (
        f"<h1>Email preferences</h1>"
        f"<p>You’re about to stop <strong>optional</strong> messages from {brand} for this address "
        f"(invitations, class updates, and similar). You’ll still get account emails when needed "
        f"(password reset, security).</p>"
        f'<form method="post" action="?token={q}">'
        f'<button type="submit">Confirm unsubscribe</button></form>'
    )
    return HTMLResponse(_html_page(inner, ok=True), status_code=200)


@router.post("/unsubscribe")
async def unsubscribe_post(request: Request, token: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """RFC 8058: mailbox providers POST with ``List-Unsubscribe=One-Click`` to the header URL."""
    await request.body()
    ok, reason = await _apply_token(token, db)
    if not ok and reason == "missing_token":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing token")
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")
    accept = (request.headers.get("accept") or "").lower()
    brand = (settings.APP_NAME or "STEMplitude").strip()
    if "text/html" in accept:
        inner = (
            f"<h1>You’re unsubscribed</h1>"
            f"<p>Optional emails from {brand} are turned off for this address.</p>"
        )
        return HTMLResponse(_html_page(inner, ok=True), status_code=200)
    return PlainTextResponse("OK", status_code=200)
