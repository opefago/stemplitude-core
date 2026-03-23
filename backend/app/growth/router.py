"""Lightweight Growth Ops router for promos/affiliates/commissions."""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.core.permissions import require_super_admin

router = APIRouter()

STORE_PATH = Path(__file__).resolve().parents[3] / "data" / "growth_store.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_store() -> dict[str, Any]:
    return {"promos": [], "affiliates": [], "commissions": []}


def _load_store() -> dict[str, Any]:
    if not STORE_PATH.exists():
        return _default_store()
    try:
        return json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return _default_store()


def _save_store(store: dict[str, Any]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


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
async def list_promos(_: None = require_super_admin()):
    return _load_store()["promos"]


@router.post("/promos", status_code=status.HTTP_201_CREATED)
async def create_promo(data: PromoCreate, _: None = require_super_admin()):
    store = _load_store()
    code = data.code.strip().upper()
    if any(p["code"] == code for p in store["promos"]):
        raise HTTPException(status_code=400, detail="Promo code already exists")
    promo = {
        "id": str(uuid.uuid4()),
        "code": code,
        "name": data.name.strip(),
        "provider": data.provider,
        "discount_type": data.discount_type,
        "discount_value": data.discount_value,
        "currency": data.currency,
        "starts_at": data.starts_at,
        "ends_at": data.ends_at,
        "max_redemptions": data.max_redemptions,
        "per_customer_limit": data.per_customer_limit,
        "first_time_only": data.first_time_only,
        "is_active": data.is_active,
        "provider_mappings": (
            data.provider_mappings.model_dump() if data.provider_mappings else None
        ),
        "created_at": _now_iso(),
    }
    store["promos"].append(promo)
    _save_store(store)
    return promo


@router.get("/promos/validate")
async def validate_promo(
    code: str = Query(..., min_length=2),
    plan_id: str | None = Query(None),
    subtotal_cents: int | None = Query(None, ge=0),
):
    store = _load_store()
    _ = plan_id  # accepted for compatibility
    promo = next((p for p in store["promos"] if p["code"] == code.strip().upper()), None)
    if not promo:
        return {"ok": False, "reason": "Promo not found", "estimated_discount_cents": 0}
    if not promo.get("is_active", True):
        return {"ok": False, "reason": "Promo is inactive", "estimated_discount_cents": 0}
    discount_type = promo.get("discount_type", "percent")
    discount_value = float(promo.get("discount_value") or 0)
    base = subtotal_cents or 0
    if discount_type == "percent":
        est = int(round(base * (discount_value / 100)))
    else:
        est = int(round(discount_value * 100))
    return {"ok": True, "reason": None, "estimated_discount_cents": max(0, min(base, est))}


@router.get("/affiliates")
async def list_affiliates(_: None = require_super_admin()):
    return _load_store()["affiliates"]


@router.post("/affiliates", status_code=status.HTTP_201_CREATED)
async def create_affiliate(data: AffiliateCreate, _: None = require_super_admin()):
    store = _load_store()
    code = data.code.strip().upper()
    if any(a["code"] == code for a in store["affiliates"]):
        raise HTTPException(status_code=400, detail="Affiliate code already exists")
    affiliate = {
        "id": str(uuid.uuid4()),
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
        "created_at": _now_iso(),
    }
    store["affiliates"].append(affiliate)
    _save_store(store)
    return affiliate


@router.get("/commissions")
async def list_commissions(_: None = require_super_admin()):
    return _load_store()["commissions"]


@router.patch("/commissions/{commission_id}/status")
async def update_commission_status(
    commission_id: str,
    body: CommissionStatusUpdate,
    _: None = require_super_admin(),
):
    store = _load_store()
    for c in store["commissions"]:
        if c["id"] == commission_id:
            c["status"] = body.status
            if body.status == "paid":
                c["paid_at"] = _now_iso()
            _save_store(store)
            return c
    raise HTTPException(status_code=404, detail="Commission not found")


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
async def export_commissions_csv(_: None = require_super_admin()):
    rows = _load_store()["commissions"]
    return _csv_response(
        rows,
        ["id", "affiliate_partner_id", "amount_cents", "currency", "status", "available_at", "paid_at", "created_at"],
        "growth-commissions.csv",
    )


@router.get("/reports/payouts.csv")
async def export_payouts_csv(_: None = require_super_admin()):
    rows = [r for r in _load_store()["commissions"] if r.get("status") in {"approved", "available"}]
    return _csv_response(
        rows,
        ["id", "affiliate_partner_id", "amount_cents", "currency", "status", "available_at"],
        "growth-payouts.csv",
    )
