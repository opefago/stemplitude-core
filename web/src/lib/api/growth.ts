import { apiFetch } from "./client";
import { ensureFreshAccessToken } from "./client";
import { getAccessToken } from "../tokens";

export type DiscountType = "percent" | "fixed";
export type CommissionType = "percent" | "fixed";
export type CommissionMode = "one_time" | "recurring";
export type AttributionModel = "first_touch" | "last_touch";

export interface ProviderMappings {
  provider_coupon_ref?: string | null;
  provider_promo_ref?: string | null;
}

export interface PromoCodeRecord {
  id: string;
  code: string;
  name: string;
  provider: string;
  discount_type: DiscountType;
  discount_value: number;
  currency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  per_customer_limit?: number | null;
  first_time_only?: boolean;
  is_active: boolean;
  provider_mappings?: ProviderMappings | null;
}

export interface AffiliateRecord {
  id: string;
  name: string;
  code: string;
  status: string;
  payout_email?: string | null;
  commission_type: CommissionType;
  commission_value: number;
  commission_mode: CommissionMode;
  commission_window_days: number;
  max_commission_cycles: number;
  attribution_model: AttributionModel;
  payout_hold_days: number;
}

export interface CommissionRecord {
  id: string;
  affiliate_partner_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  available_at?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface PromoValidateResult {
  ok: boolean;
  reason?: string | null;
  estimated_discount_cents?: number;
}

export async function listPromos(): Promise<PromoCodeRecord[]> {
  return apiFetch<PromoCodeRecord[]>("/growth/promos");
}

export async function createPromo(payload: Partial<PromoCodeRecord>): Promise<PromoCodeRecord> {
  return apiFetch<PromoCodeRecord>("/growth/promos", {
    method: "POST",
    body: payload,
  });
}

export async function listAffiliates(): Promise<AffiliateRecord[]> {
  return apiFetch<AffiliateRecord[]>("/growth/affiliates");
}

export async function createAffiliate(payload: Partial<AffiliateRecord>): Promise<AffiliateRecord> {
  return apiFetch<AffiliateRecord>("/growth/affiliates", {
    method: "POST",
    body: payload,
  });
}

export async function listCommissions(): Promise<CommissionRecord[]> {
  return apiFetch<CommissionRecord[]>("/growth/commissions");
}

export async function updateCommissionStatus(
  id: string,
  status: "accrued" | "pending" | "approved" | "available" | "paid" | "reversed",
): Promise<CommissionRecord> {
  return apiFetch<CommissionRecord>(`/growth/commissions/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export async function validatePromo(
  code: string,
  planId?: string,
  subtotalCents?: number,
): Promise<PromoValidateResult> {
  const query = new URLSearchParams();
  query.set("code", code);
  if (planId) query.set("plan_id", planId);
  if (subtotalCents != null) query.set("subtotal_cents", String(subtotalCents));
  return apiFetch<PromoValidateResult>(`/growth/promos/validate?${query.toString()}`);
}

export function getCommissionFileExportUrl(): string {
  return "/api/v1/growth/reports/commissions.csv";
}

export function getPayoutFileExportUrl(): string {
  return "/api/v1/growth/reports/payouts.csv";
}

export async function downloadCsvWithAuth(url: string, filename: string): Promise<void> {
  const refreshed = await ensureFreshAccessToken(45);
  if (!refreshed) throw new Error("Session expired");
  const token = getAccessToken();
  if (!token) throw new Error("Authorization header required");

  const tenantId = localStorage.getItem("tenant_id");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(tenantId ? { "X-Tenant-ID": tenantId } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
