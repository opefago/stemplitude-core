import { apiFetch } from "./client";

export type BillingCycle = "monthly" | "yearly";

export interface SubscriptionRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  plan_id: string;
  status: string;
  provider: string;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  canceled_at?: string | null;
  promo_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionListResponse {
  items: SubscriptionRecord[];
  total: number;
}

export interface InvoiceRecord {
  id: string;
  subscription_id: string;
  stripe_invoice_id?: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface CreateCheckoutPayload {
  plan_id: string;
  success_url: string;
  cancel_url: string;
  billing_cycle: BillingCycle;
  promo_code?: string | null;
  affiliate_code?: string | null;
}

export interface CheckoutSessionResponse {
  session_id: string;
  url?: string | null;
}

export async function createCheckoutSession(
  payload: CreateCheckoutPayload,
): Promise<CheckoutSessionResponse> {
  return apiFetch<CheckoutSessionResponse>("/subscriptions/checkout", {
    method: "POST",
    body: payload,
  });
}

export async function listSubscriptions(params?: {
  skip?: number;
  limit?: number;
}): Promise<SubscriptionListResponse> {
  const query = new URLSearchParams();
  if (params?.skip != null) {
    query.set("skip", String(params.skip));
  }
  if (params?.limit != null) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<SubscriptionListResponse>(`/subscriptions${suffix}`);
}

export async function listSubscriptionInvoices(
  subscriptionId: string,
  params?: { skip?: number; limit?: number },
): Promise<InvoiceRecord[]> {
  const query = new URLSearchParams();
  if (params?.skip != null) {
    query.set("skip", String(params.skip));
  }
  if (params?.limit != null) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<InvoiceRecord[]>(
    `/subscriptions/${subscriptionId}/invoices${suffix}`,
  );
}

