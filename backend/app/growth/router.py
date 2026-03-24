"""Growth Ops router backed by database tables."""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_global_permission
from app.database import get_db

router = APIRouter()
COMMISSION_STATUSES = {"accrued", "pending", "approved", "available", "paid", "reversed"}


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _normalize_decimal(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _resolve_tenant_id(request: Request) -> str:
    tenant = getattr(request.state, "tenant", None)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    return str(tenant.tenant_id)


async def _materialize_commission_statuses(db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            UPDATE affiliate_commissions
            SET status = 'available'
            WHERE status = 'accrued'
              AND available_at IS NOT NULL
              AND available_at <= now()
            """
        )
    )


async def validate_promo_for_checkout(
    *,
    db: AsyncSession,
    tenant_id: str,
    code: str,
    user_id: str | None = None,
    subtotal_cents: int | None = None,
) -> dict[str, Any]:
    normalized = _normalize_code(code)
    promo_row = await db.execute(
        text(
            """
            SELECT id, code, discount_type, discount_value, percent_off, amount_off_cents,
                   starts_at, ends_at, max_redemptions, per_customer_limit, first_time_only, is_active
            FROM promo_codes
            WHERE upper(code) = :code
              AND (tenant_id::text = :tenant_id OR tenant_id IS NULL)
            ORDER BY CASE WHEN tenant_id::text = :tenant_id THEN 0 ELSE 1 END
            LIMIT 1
            """
        ),
        {"code": normalized, "tenant_id": tenant_id},
    )
    promo = promo_row.mappings().first()
    if not promo:
        return {"ok": False, "reason": "Promo not found", "estimated_discount_cents": 0}
    if promo.get("is_active") is False:
        return {"ok": False, "reason": "Promo is inactive", "estimated_discount_cents": 0}

    now = _now_dt()
    starts_at = promo.get("starts_at")
    ends_at = promo.get("ends_at")
    if starts_at and now < starts_at:
        return {"ok": False, "reason": "Promo is not active yet", "estimated_discount_cents": 0}
    if ends_at and now > ends_at:
        return {"ok": False, "reason": "Promo has expired", "estimated_discount_cents": 0}

    count_row = await db.execute(
        text("SELECT count(*) AS c FROM promo_redemptions WHERE promo_code_id = :promo_id"),
        {"promo_id": str(promo["id"])},
    )
    total_redeemed = int(count_row.scalar() or 0)
    max_redemptions = promo.get("max_redemptions")
    if max_redemptions is not None and total_redeemed >= int(max_redemptions):
        return {"ok": False, "reason": "Promo redemption cap reached", "estimated_discount_cents": 0}

    if user_id:
        per_user_row = await db.execute(
            text(
                """
                SELECT count(*) AS c
                FROM promo_redemptions pr
                LEFT JOIN subscriptions s ON s.id = pr.subscription_id
                WHERE pr.promo_code_id = :promo_id
                  AND (pr.user_id::text = :user_id OR s.user_id::text = :user_id)
                """
            ),
            {"promo_id": str(promo["id"]), "user_id": user_id},
        )
        per_user_count = int(per_user_row.scalar() or 0)
        per_customer_limit = promo.get("per_customer_limit")
        if per_customer_limit is not None and per_user_count >= int(per_customer_limit):
            return {"ok": False, "reason": "Per-customer limit reached", "estimated_discount_cents": 0}
        if promo.get("first_time_only") and per_user_count > 0:
            return {"ok": False, "reason": "Promo is first-time only", "estimated_discount_cents": 0}

    discount_type = str(promo.get("discount_type") or "percent")
    discount_value = _normalize_decimal(promo.get("discount_value"))
    if discount_value <= 0:
        if discount_type == "percent":
            discount_value = _normalize_decimal(promo.get("percent_off"))
        else:
            amount_off_cents = promo.get("amount_off_cents")
            discount_value = float(amount_off_cents or 0) / 100.0

    base = int(subtotal_cents or 0)
    if discount_type == "percent":
        est = int(round(base * (discount_value / 100)))
    else:
        est = int(round(discount_value * 100))
    return {
        "ok": True,
        "reason": None,
        "estimated_discount_cents": max(0, min(base, est)),
        "promo_id": str(promo["id"]),
    }


async def process_paid_invoice_for_growth(
    *,
    db: AsyncSession,
    event_id: str,
    tenant_id: str,
    user_id: str,
    subscription_id: str,
    invoice_id: str,
    amount_cents: int,
    currency: str,
    promo_code: str | None,
    affiliate_code: str | None,
    paid_at_iso: str | None = None,
) -> dict[str, Any]:
    existing = await db.execute(
        text(
            """
            SELECT id
            FROM billing_webhook_events
            WHERE provider = 'growth' AND event_id = :event_id
            LIMIT 1
            """
        ),
        {"event_id": event_id},
    )
    if existing.first():
        return {"ok": True, "idempotent": True}

    normalized_promo = _normalize_code(promo_code)
    normalized_affiliate = _normalize_code(affiliate_code)
    now_dt = datetime.fromisoformat(paid_at_iso.replace("Z", "+00:00")) if paid_at_iso else _now_dt()

    if normalized_promo:
        promo_validation = await validate_promo_for_checkout(
            db=db,
            tenant_id=tenant_id,
            code=normalized_promo,
            user_id=user_id,
            subtotal_cents=max(0, amount_cents),
        )
        if promo_validation.get("ok"):
            discounted = int(promo_validation.get("estimated_discount_cents") or 0)
            await db.execute(
                text(
                    """
                    INSERT INTO promo_redemptions (
                      id, promo_code_id, subscription_id, invoice_id, tenant_id,
                      provider, provider_event_id, provider_invoice_id,
                      amount_discounted_cents, currency, redeemed_at, user_id
                    ) VALUES (
                      :id, :promo_code_id, :subscription_id, NULL, :tenant_id,
                      'stripe', :event_id, :provider_invoice_id,
                      :amount_discounted_cents, :currency, :redeemed_at, :user_id
                    )
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "promo_code_id": promo_validation["promo_id"],
                    "subscription_id": subscription_id,
                    "tenant_id": tenant_id,
                    "event_id": event_id,
                    "provider_invoice_id": invoice_id,
                    "amount_discounted_cents": discounted,
                    "currency": (currency or "usd").lower(),
                    "redeemed_at": now_dt,
                    "user_id": user_id,
                },
            )

    if normalized_affiliate:
        affiliate_row = await db.execute(
            text(
                """
                SELECT id, commission_type, commission_value, commission_mode, commission_window_days,
                       max_commission_cycles, payout_hold_days, status
                FROM affiliate_partners
                WHERE upper(code) = :code
                  AND (tenant_id::text = :tenant_id OR tenant_id IS NULL)
                ORDER BY CASE WHEN tenant_id::text = :tenant_id THEN 0 ELSE 1 END
                LIMIT 1
                """
            ),
            {"code": normalized_affiliate, "tenant_id": tenant_id},
        )
        affiliate = affiliate_row.mappings().first()
        if affiliate and affiliate.get("status") in {"active", "approved"}:
            prior_cycles_row = await db.execute(
                text(
                    """
                    SELECT count(*) AS c
                    FROM affiliate_conversions
                    WHERE affiliate_partner_id = :affiliate_partner_id
                      AND subscription_id::text = :subscription_id
                    """
                ),
                {
                    "affiliate_partner_id": str(affiliate["id"]),
                    "subscription_id": subscription_id,
                },
            )
            cycle_number = int(prior_cycles_row.scalar() or 0) + 1
            skipped_reason = None
            commission_mode = str(affiliate.get("commission_mode") or "one_time")
            max_cycles = int(affiliate.get("max_commission_cycles") or 1)
            if commission_mode == "one_time" and cycle_number > 1:
                skipped_reason = "one_time_limit_reached"
            elif commission_mode == "recurring" and cycle_number > max_cycles:
                skipped_reason = "max_commission_cycles_reached"

            conversion_id = str(uuid.uuid4())
            await db.execute(
                text(
                    """
                    INSERT INTO affiliate_conversions (
                      id, affiliate_partner_id, subscription_id, invoice_id, tenant_id,
                      provider, provider_event_id, provider_invoice_id, provider_subscription_id,
                      gross_amount_cents, currency, status, occurred_at,
                      skipped_reason, attribution_start_at, attribution_end_at,
                      commission_cycle_number, user_id
                    ) VALUES (
                      :id, :affiliate_partner_id, :subscription_id, NULL, :tenant_id,
                      'stripe', :event_id, :provider_invoice_id, :provider_subscription_id,
                      :gross_amount_cents, :currency, :status, :occurred_at,
                      :skipped_reason, :attribution_start_at, :attribution_end_at,
                      :commission_cycle_number, :user_id
                    )
                    """
                ),
                {
                    "id": conversion_id,
                    "affiliate_partner_id": str(affiliate["id"]),
                    "subscription_id": subscription_id,
                    "tenant_id": tenant_id,
                    "event_id": event_id,
                    "provider_invoice_id": invoice_id,
                    "provider_subscription_id": subscription_id,
                    "gross_amount_cents": max(0, amount_cents),
                    "currency": (currency or "usd").lower(),
                    "status": "skipped" if skipped_reason else "attributed",
                    "occurred_at": now_dt,
                    "skipped_reason": skipped_reason,
                    "attribution_start_at": now_dt,
                    "attribution_end_at": now_dt + timedelta(days=int(affiliate.get("commission_window_days") or 365)),
                    "commission_cycle_number": cycle_number,
                    "user_id": user_id,
                },
            )

            if not skipped_reason:
                commission_value = _normalize_decimal(affiliate.get("commission_value"))
                if str(affiliate.get("commission_type") or "percent") == "percent":
                    commission_cents = int(round(max(0, amount_cents) * (commission_value / 100)))
                else:
                    commission_cents = int(round(commission_value * 100))
                hold_days = int(affiliate.get("payout_hold_days") or 0)
                tenant_mode_row = await db.execute(
                    text("SELECT billing_mode FROM tenants WHERE id::text = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                billing_mode = (tenant_mode_row.scalar() or "live").lower()
                is_internal = billing_mode == "internal"
                await db.execute(
                    text(
                        """
                        INSERT INTO affiliate_commissions (
                          id, affiliate_partner_id, conversion_id, amount_cents, currency,
                          status, created_at, updated_at, available_at, conversion_invoice_id,
                          is_payable, non_payable_reason
                        ) VALUES (
                          :id, :affiliate_partner_id, :conversion_id, :amount_cents, :currency,
                          :status, :created_at, :updated_at, :available_at, :conversion_invoice_id,
                          :is_payable, :non_payable_reason
                        )
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "affiliate_partner_id": str(affiliate["id"]),
                        "conversion_id": conversion_id,
                        "amount_cents": max(0, commission_cents),
                        "currency": (currency or "usd").lower(),
                        "status": "accrued",
                        "created_at": now_dt,
                        "updated_at": now_dt,
                        "available_at": now_dt + timedelta(days=hold_days),
                        "conversion_invoice_id": invoice_id,
                        "is_payable": not is_internal,
                        "non_payable_reason": "internal_org" if is_internal else None,
                    },
                )

    await db.execute(
        text(
            """
            INSERT INTO billing_webhook_events (id, provider, event_id, event_type, payload, processed_at)
            VALUES (:id, 'growth', :event_id, 'invoice.paid', :payload::jsonb, :processed_at)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "payload": json.dumps({"invoice_id": invoice_id, "subscription_id": subscription_id}),
            "processed_at": now_dt,
        },
    )
    await _materialize_commission_statuses(db)
    return {"ok": True, "idempotent": False}


class ProviderMappings(BaseModel):
    provider_coupon_ref: str | None = None
    provider_promo_ref: str | None = None


class PromoCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    provider: str = "stripe"
    discount_type: str = "percent"
    discount_value: float = 0
    currency: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    max_redemptions: int | None = None
    per_customer_limit: int | None = None
    first_time_only: bool = False
    is_active: bool = True
    provider_mappings: ProviderMappings | None = None


class AffiliateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=2, max_length=64)
    status: str = "active"
    payout_email: str | None = None
    commission_type: str = "percent"
    commission_value: float = 0
    commission_mode: str = "one_time"
    commission_window_days: int = 365
    max_commission_cycles: int = 1
    attribution_model: str = "last_touch"
    payout_hold_days: int = 30


class CommissionStatusUpdate(BaseModel):
    status: str


@router.get("/promos")
async def list_promos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "view"),
):
    tenant_id = _resolve_tenant_id(request)
    rows = await db.execute(
        text(
            """
            SELECT id, code, name, provider, discount_type,
                   COALESCE(discount_value, percent_off, COALESCE(amount_off_cents, 0) / 100.0) AS discount_value,
                   currency, starts_at, ends_at, max_redemptions, per_customer_limit,
                   first_time_only, is_active, provider_mappings
            FROM promo_codes
            WHERE tenant_id::text = :tenant_id OR tenant_id IS NULL
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return [dict(row) for row in rows.mappings().all()]


@router.post("/promos", status_code=status.HTTP_201_CREATED)
async def create_promo(
    data: PromoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "manage"),
):
    tenant_id = _resolve_tenant_id(request)
    code = _normalize_code(data.code)
    existing = await db.execute(
        text(
            """
            SELECT id
            FROM promo_codes
            WHERE upper(code) = :code
              AND (tenant_id::text = :tenant_id OR tenant_id IS NULL)
            LIMIT 1
            """
        ),
        {"code": code, "tenant_id": tenant_id},
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Promo code already exists")

    promo_id = str(uuid.uuid4())
    starts_at = datetime.fromisoformat(data.starts_at.replace("Z", "+00:00")) if data.starts_at else None
    ends_at = datetime.fromisoformat(data.ends_at.replace("Z", "+00:00")) if data.ends_at else None
    mappings = data.provider_mappings.model_dump() if data.provider_mappings else {}
    await db.execute(
        text(
            """
            INSERT INTO promo_codes (
              id, tenant_id, code, name, provider, discount_type, discount_value, currency,
              starts_at, ends_at, max_redemptions, per_customer_limit, first_time_only, is_active,
              provider_mappings, provider_coupon_id, provider_promotion_code_id, applies_to,
              percent_off, amount_off_cents, created_at, updated_at
            ) VALUES (
              :id, :tenant_id, :code, :name, :provider, :discount_type, :discount_value, :currency,
              :starts_at, :ends_at, :max_redemptions, :per_customer_limit, :first_time_only, :is_active,
              :provider_mappings::jsonb, :provider_coupon_id, :provider_promotion_code_id, 'all',
              :percent_off, :amount_off_cents, :created_at, :updated_at
            )
            """
        ),
        {
            "id": promo_id,
            "tenant_id": tenant_id,
            "code": code,
            "name": data.name.strip(),
            "provider": data.provider,
            "discount_type": data.discount_type,
            "discount_value": data.discount_value,
            "currency": data.currency,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "max_redemptions": data.max_redemptions,
            "per_customer_limit": data.per_customer_limit,
            "first_time_only": data.first_time_only,
            "is_active": data.is_active,
            "provider_mappings": json.dumps(mappings),
            "provider_coupon_id": mappings.get("provider_coupon_ref"),
            "provider_promotion_code_id": mappings.get("provider_promo_ref"),
            "percent_off": data.discount_value if data.discount_type == "percent" else None,
            "amount_off_cents": int(round(data.discount_value * 100)) if data.discount_type != "percent" else None,
            "created_at": _now_dt(),
            "updated_at": _now_dt(),
        },
    )
    row = await db.execute(
        text(
            """
            SELECT id, code, name, provider, discount_type, discount_value, currency, starts_at, ends_at,
                   max_redemptions, per_customer_limit, first_time_only, is_active, provider_mappings
            FROM promo_codes
            WHERE id = :id
            """
        ),
        {"id": promo_id},
    )
    return dict(row.mappings().first())


@router.get("/promos/validate")
async def validate_promo(
    request: Request,
    db: AsyncSession = Depends(get_db),
    code: str = Query(..., min_length=2),
    plan_id: str | None = Query(None),
    subtotal_cents: int | None = Query(None, ge=0),
):
    _ = plan_id
    tenant_id = _resolve_tenant_id(request)
    result = await validate_promo_for_checkout(
        db=db,
        tenant_id=tenant_id,
        code=code,
        subtotal_cents=subtotal_cents,
    )
    result.pop("promo_id", None)
    return result


@router.get("/affiliates")
async def list_affiliates(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "view"),
):
    tenant_id = _resolve_tenant_id(request)
    rows = await db.execute(
        text(
            """
            SELECT id, name, code, status, payout_email, commission_type, commission_value,
                   commission_mode, commission_window_days, max_commission_cycles,
                   attribution_model, payout_hold_days, created_at
            FROM affiliate_partners
            WHERE tenant_id::text = :tenant_id OR tenant_id IS NULL
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return [dict(row) for row in rows.mappings().all()]


@router.post("/affiliates", status_code=status.HTTP_201_CREATED)
async def create_affiliate(
    data: AffiliateCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "manage"),
):
    tenant_id = _resolve_tenant_id(request)
    code = _normalize_code(data.code)
    existing = await db.execute(
        text(
            """
            SELECT id
            FROM affiliate_partners
            WHERE upper(code) = :code
              AND (tenant_id::text = :tenant_id OR tenant_id IS NULL)
            LIMIT 1
            """
        ),
        {"code": code, "tenant_id": tenant_id},
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Affiliate code already exists")

    affiliate_id = str(uuid.uuid4())
    now = _now_dt()
    await db.execute(
        text(
            """
            INSERT INTO affiliate_partners (
              id, tenant_id, name, code, status, payout_email, commission_type, commission_value,
              commission_mode, commission_window_days, max_commission_cycles, attribution_model,
              payout_hold_days, created_at, updated_at
            ) VALUES (
              :id, :tenant_id, :name, :code, :status, :payout_email, :commission_type, :commission_value,
              :commission_mode, :commission_window_days, :max_commission_cycles, :attribution_model,
              :payout_hold_days, :created_at, :updated_at
            )
            """
        ),
        {
            "id": affiliate_id,
            "tenant_id": tenant_id,
            "name": data.name.strip(),
            "code": code,
            "status": data.status,
            "payout_email": data.payout_email,
            "commission_type": data.commission_type,
            "commission_value": data.commission_value,
            "commission_mode": data.commission_mode,
            "commission_window_days": data.commission_window_days,
            "max_commission_cycles": data.max_commission_cycles,
            "attribution_model": data.attribution_model,
            "payout_hold_days": data.payout_hold_days,
            "created_at": now,
            "updated_at": now,
        },
    )
    row = await db.execute(
        text(
            """
            SELECT id, name, code, status, payout_email, commission_type, commission_value,
                   commission_mode, commission_window_days, max_commission_cycles,
                   attribution_model, payout_hold_days, created_at
            FROM affiliate_partners
            WHERE id = :id
            """
        ),
        {"id": affiliate_id},
    )
    return dict(row.mappings().first())


@router.get("/commissions")
async def list_commissions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "view"),
):
    tenant_id = _resolve_tenant_id(request)
    await _materialize_commission_statuses(db)
    rows = await db.execute(
        text(
            """
            SELECT ac.id, ac.affiliate_partner_id, ac.amount_cents, ac.currency, ac.status, ac.available_at, ac.paid_at, ac.created_at
            FROM affiliate_commissions ac
            LEFT JOIN affiliate_partners ap ON ap.id = ac.affiliate_partner_id
            WHERE ap.tenant_id::text = :tenant_id OR ap.tenant_id IS NULL
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return [dict(row) for row in rows.mappings().all()]


@router.patch("/commissions/{commission_id}/status")
async def update_commission_status(
    commission_id: str,
    body: CommissionStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "manage"),
):
    new_status = (body.status or "").strip().lower()
    if new_status not in COMMISSION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid commission status")
    now = _now_dt()
    result = await db.execute(
        text(
            """
            UPDATE affiliate_commissions
            SET status = :status,
                paid_at = CASE WHEN :status = 'paid' THEN :now ELSE paid_at END,
                updated_at = :now
            WHERE id::text = :commission_id
            RETURNING id, affiliate_partner_id, amount_cents, currency, status, available_at, paid_at, created_at
            """
        ),
        {"status": new_status, "now": now, "commission_id": commission_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Commission not found")
    return dict(row)


def _csv_response(rows: list[dict[str, Any]], fields: list[str], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k) for k in fields})
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/commissions.csv")
async def export_commissions_csv(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "view"),
):
    tenant_id = _resolve_tenant_id(request)
    await _materialize_commission_statuses(db)
    rows = await db.execute(
        text(
            """
            SELECT ac.id, ac.affiliate_partner_id, ac.amount_cents, ac.currency, ac.status, ac.available_at, ac.paid_at, ac.created_at
            FROM affiliate_commissions ac
            LEFT JOIN affiliate_partners ap ON ap.id = ac.affiliate_partner_id
            WHERE ap.tenant_id::text = :tenant_id OR ap.tenant_id IS NULL
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return _csv_response(
        [dict(row) for row in rows.mappings().all()],
        ["id", "affiliate_partner_id", "amount_cents", "currency", "status", "available_at", "paid_at", "created_at"],
        "growth-commissions.csv",
    )


@router.get("/reports/payouts.csv")
async def export_payouts_csv(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_global_permission("platform.growth", "view"),
):
    tenant_id = _resolve_tenant_id(request)
    await _materialize_commission_statuses(db)
    rows = await db.execute(
        text(
            """
            SELECT ac.id, ac.affiliate_partner_id, ac.amount_cents, ac.currency, ac.status, ac.available_at
            FROM affiliate_commissions ac
            LEFT JOIN affiliate_partners ap ON ap.id = ac.affiliate_partner_id
            WHERE (ap.tenant_id::text = :tenant_id OR ap.tenant_id IS NULL)
              AND ac.status IN ('approved', 'available')
              AND COALESCE(ac.is_payable, true) = true
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return _csv_response(
        [dict(row) for row in rows.mappings().all()],
        ["id", "affiliate_partner_id", "amount_cents", "currency", "status", "available_at"],
        "growth-payouts.csv",
    )
