import { apiFetch } from "./client";

export interface AdminStats {
  tenant_count: number;
  active_tenant_count: number;
  user_count: number;
  student_count: number;
  active_subscription_count: number;
}

export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface TenantListResponse {
  items: AdminTenantSummary[];
  total: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/admin/stats");
}

export async function listAdminTenants(
  params: { skip?: number; limit?: number; is_active?: boolean } = {},
): Promise<TenantListResponse> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString();
  return apiFetch<TenantListResponse>(`/admin/tenants${query ? `?${query}` : ""}`);
}
