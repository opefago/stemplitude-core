import { apiFetch, ApiHttpError } from "./client";

export interface MemberBillingConnectStatus {
  stripe_connect_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  member_billing_enabled: boolean;
  require_member_billing_for_access: boolean;
  connect_configured: boolean;
}

export interface MemberBillingSettingsPatch {
  member_billing_enabled?: boolean;
  require_member_billing_for_access?: boolean;
}

export interface MemberProduct {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  billing_type: string;
  interval: string | null;
  active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
}

export interface MemberProductCreatePayload {
  name: string;
  description?: string | null;
  amount_cents: number;
  currency?: string;
  billing_type: "one_time" | "recurring";
  interval?: "month" | "quarter" | "year" | null;
}

/** PATCH body: include only fields to change. Pricing requires amount_cents, currency, and billing_type together. */
export interface MemberProductUpdatePayload {
  name?: string;
  description?: string | null;
  active?: boolean;
  amount_cents?: number;
  currency?: string;
  billing_type?: "one_time" | "recurring";
  interval?: "month" | "quarter" | "year" | null;
}

export interface MemberSubscription {
  id: string;
  tenant_id: string;
  product_id: string;
  student_id: string;
  payer_user_id: string | null;
  status: string;
  stripe_subscription_id?: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface MemberInvoice {
  id: string;
  tenant_id: string;
  member_subscription_id: string | null;
  member_purchase_id?: string | null;
  stripe_invoice_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface MemberBillingAnalytics {
  period_start: string;
  period_end: string;
  active_subscriptions: number;
  new_subscriptions: number;
  canceled_subscriptions: number;
  churn_rate_percent: number | null;
  revenue_cents: number;
  paid_invoices_count: number;
  mrr_cents_approx: number;
}

export interface AccountLinkResponse {
  url: string;
}

export interface CheckoutPayload {
  product_id: string;
  student_id: string;
}

export interface CheckoutResponse {
  url: string;
}

export interface MemberBillingIntegrationsSummary {
  platform_stripe_configured: boolean;
  connect_account_linked: boolean;
  charges_enabled: boolean;
  member_billing_enabled: boolean;
  details_submitted: boolean;
}

export interface GuardianChildMembership {
  student_id: string;
  has_active_membership: boolean;
}

export interface GuardianMemberStatus {
  member_billing_enabled: boolean;
  require_member_billing_for_access: boolean;
  children: GuardianChildMembership[];
}

export interface AdminMemberPaymentLinkPayload {
  student_id: string;
  product_id: string;
  payer_user_id?: string | null;
}

export async function getMemberBillingIntegrationsSummary(): Promise<MemberBillingIntegrationsSummary> {
  return apiFetch<MemberBillingIntegrationsSummary>("/member-billing/integrations/summary");
}

export async function getMemberBillingConnectStatus(): Promise<MemberBillingConnectStatus> {
  return apiFetch<MemberBillingConnectStatus>("/member-billing/connect/status");
}

export async function patchMemberBillingSettings(
  body: MemberBillingSettingsPatch,
): Promise<MemberBillingConnectStatus> {
  return apiFetch<MemberBillingConnectStatus>("/member-billing/settings", {
    method: "PATCH",
    body,
  });
}

export async function syncMemberBillingConnect(): Promise<MemberBillingConnectStatus> {
  return apiFetch<MemberBillingConnectStatus>("/member-billing/connect/sync", {
    method: "POST",
  });
}

export async function startMemberBillingOnboarding(): Promise<AccountLinkResponse> {
  return apiFetch<AccountLinkResponse>("/member-billing/connect/onboarding", {
    method: "POST",
  });
}

export async function createMemberProduct(
  body: MemberProductCreatePayload,
): Promise<MemberProduct> {
  return apiFetch<MemberProduct>("/member-billing/products", {
    method: "POST",
    body,
  });
}

export async function patchMemberProduct(
  productId: string,
  body: MemberProductUpdatePayload,
): Promise<MemberProduct> {
  return apiFetch<MemberProduct>(`/member-billing/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body,
  });
}

export async function cancelMemberSubscription(
  subscriptionId: string,
  options: { immediate?: boolean } = {},
): Promise<MemberSubscription> {
  return apiFetch<MemberSubscription>(
    `/member-billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: { immediate: Boolean(options.immediate) },
    },
  );
}

export async function listMemberProductsAdmin(): Promise<MemberProduct[]> {
  return apiFetch<MemberProduct[]>("/member-billing/products");
}

export async function getMemberPayCatalog(): Promise<MemberProduct[]> {
  return apiFetch<MemberProduct[]>("/member-billing/pay/catalog");
}

export async function createMemberCheckout(body: CheckoutPayload): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/member-billing/checkout", {
    method: "POST",
    body,
  });
}

export async function createAdminMemberPaymentLink(
  body: AdminMemberPaymentLinkPayload,
): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/member-billing/admin/payment-link", {
    method: "POST",
    body: {
      student_id: body.student_id,
      product_id: body.product_id,
      payer_user_id: body.payer_user_id ?? null,
    },
  });
}

export async function listMemberSubscriptionsAdmin(): Promise<MemberSubscription[]> {
  return apiFetch<MemberSubscription[]>("/member-billing/subscriptions");
}

export async function listMemberInvoicesAdmin(): Promise<MemberInvoice[]> {
  return apiFetch<MemberInvoice[]>("/member-billing/invoices");
}

export async function getMemberBillingAnalytics(
  days = 30,
): Promise<MemberBillingAnalytics> {
  return apiFetch<MemberBillingAnalytics>(
    `/member-billing/analytics/summary?days=${encodeURIComponent(String(days))}`,
  );
}

export async function listMyMemberInvoices(): Promise<MemberInvoice[]> {
  return apiFetch<MemberInvoice[]>("/member-billing/me/invoices");
}

export async function getGuardianMemberStatus(): Promise<GuardianMemberStatus> {
  return apiFetch<GuardianMemberStatus>("/member-billing/me/guardian-status");
}
