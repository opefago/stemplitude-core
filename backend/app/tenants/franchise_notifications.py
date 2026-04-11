"""In-app notifications for franchise (hierarchy) join requests and decisions."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification
from app.realtime.user_events import publish_notifications_changed

logger = logging.getLogger(__name__)

SETTINGS_FRANCHISE_TAB = "/app/settings?tab=franchise"


async def persist_parent_franchise_request_notifications(
    db: AsyncSession,
    *,
    parent_tenant_id: UUID,
    child_display_name: str,
    child_slug: str,
    recipient_user_ids: list[UUID],
) -> None:
    """Notify parent org owners/admins that a child workspace requested a franchise link."""
    if not recipient_user_ids:
        return
    title = f"Franchise request: {child_display_name}"
    body = (
        f"{child_display_name} ({child_slug}) asked to link under your organization. "
        "Approve or decline in Organization Settings → Franchise & domain."
    )
    for uid in recipient_user_ids:
        db.add(
            Notification(
                user_id=uid,
                student_id=None,
                tenant_id=parent_tenant_id,
                type="franchise_join_request",
                title=title[:200],
                body=body,
                action_path=SETTINGS_FRANCHISE_TAB,
                action_label="Review request",
            )
        )
    await db.flush()
    for uid in recipient_user_ids:
        try:
            await publish_notifications_changed(parent_tenant_id, uid)
        except Exception:
            logger.exception(
                "publish notifications.changed failed franchise request parent=%s user=%s",
                parent_tenant_id,
                uid,
            )


async def persist_child_franchise_decision_notifications(
    db: AsyncSession,
    *,
    child_tenant_id: UUID,
    parent_display_name: str,
    parent_slug: str,
    approved: bool,
    billing_mode: str | None,
    rejection_reason: str | None,
    recipient_user_ids: list[UUID],
) -> None:
    """Notify child org admins (and requester) that the parent approved or declined."""
    if not recipient_user_ids:
        return
    slug_part = f" ({parent_slug})" if parent_slug else ""
    if approved:
        title = f"Franchise link approved: {parent_display_name}"
        bm = (billing_mode or "").replace("_", " ").strip()
        body = (
            f"{parent_display_name}{slug_part} approved your franchise link request."
            + (f" Billing mode: {bm}." if bm else "")
        )
    else:
        title = f"Franchise request declined: {parent_display_name}"
        body = f"{parent_display_name}{slug_part} did not approve the franchise link."
        if rejection_reason and rejection_reason.strip():
            body = f"{body} {rejection_reason.strip()}"

    for uid in recipient_user_ids:
        db.add(
            Notification(
                user_id=uid,
                student_id=None,
                tenant_id=child_tenant_id,
                type="franchise_join_decision",
                title=title[:200],
                body=body,
                action_path=SETTINGS_FRANCHISE_TAB,
                action_label="Franchise & domain",
            )
        )
    await db.flush()
    for uid in recipient_user_ids:
        try:
            await publish_notifications_changed(child_tenant_id, uid)
        except Exception:
            logger.exception(
                "publish notifications.changed failed franchise decision child=%s user=%s",
                child_tenant_id,
                uid,
            )
