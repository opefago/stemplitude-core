import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  code: string;
  type: string;
  logo_url?: string;
}

export async function listUserTenants(): Promise<TenantListItem[]> {
  const data = await apiFetch<{ items: TenantListItem[]; total: number }>("/tenants/");
  return data.items ?? [];
}

export interface CreateTenantPayload {
  name: string;
  slug: string;
  code: string;
  type?: string;
  logo_url?: string;
  settings?: Record<string, unknown>;
  /** Public subdomain label (e.g. oakridge for oakridge.platform.com). */
  public_host_subdomain?: string | null;
  /** Custom hostname after DNS is configured. */
  custom_domain?: string | null;
}

/** Create a new organization; caller becomes admin. Omit tenant header. */
export async function createTenant(payload: CreateTenantPayload): Promise<TenantInfo> {
  const data = await apiFetch<Parameters<typeof mapTenant>[0]>("/tenants/", {
    method: "POST",
    body: payload,
    skipTenantHeader: true,
  });
  return mapTenant(data);
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  code: string;
  type: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
  publicHostSubdomain?: string;
  customDomain?: string;
}

function mapTenant(data: {
  id: string;
  name: string;
  slug: string;
  code: string;
  type: string;
  logo_url?: string;
  settings?: Record<string, unknown>;
  public_host_subdomain?: string | null;
  custom_domain?: string | null;
}): TenantInfo {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    code: data.code,
    type: data.type,
    logoUrl: data.logo_url,
    settings: data.settings,
    publicHostSubdomain: data.public_host_subdomain ?? undefined,
    customDomain: data.custom_domain ?? undefined,
  };
}

export async function getTenantById(id: string): Promise<TenantInfo> {
  const data = await apiFetch<{
    id: string;
    name: string;
    slug: string;
    code: string;
    type: string;
    logo_url?: string;
    settings?: Record<string, unknown>;
    public_host_subdomain?: string | null;
    custom_domain?: string | null;
  }>(`/tenants/${id}`, { tenantId: id });
  return mapTenant(data);
}

/** No auth — used on tenant subdomains to discover org slug for student login. */
export async function getPublicTenantByHostLabel(label: string): Promise<{
  id: string;
  name: string;
  slug: string;
  public_host_subdomain?: string | null;
}> {
  return apiFetch(`/tenants/public/by-host/${encodeURIComponent(label)}`, {
    skipAuth: true,
    skipTenantHeader: true,
  });
}

export async function patchTenant(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<TenantInfo> {
  const data = await apiFetch<Parameters<typeof mapTenant>[0]>(`/tenants/${tenantId}`, {
    method: "PATCH",
    tenantId,
    body,
  });
  return mapTenant(data);
}

export async function updateTenantSettings(
  tenantId: string,
  settings: Record<string, unknown>,
): Promise<TenantInfo> {
  const data = await apiFetch<Parameters<typeof mapTenant>[0]>(`/tenants/${tenantId}`, {
    method: "PATCH",
    tenantId,
    body: { settings },
  });
  return mapTenant(data);
}

export interface FranchiseJoinRequest {
  id: string;
  child_tenant_id: string;
  parent_tenant_id: string;
  status: string;
  message?: string | null;
  preferred_billing_mode?: string | null;
  requested_by_user_id: string;
  decided_by_user_id?: string | null;
  decided_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export async function listFranchiseJoinRequests(
  tenantId: string,
  status: string = "pending",
): Promise<{ items: FranchiseJoinRequest[]; total: number }> {
  return apiFetch(`/tenants/${tenantId}/hierarchy-requests?status=${encodeURIComponent(status)}`, {
    tenantId,
  });
}

export async function submitFranchiseJoinRequest(
  body: {
    parent_slug?: string;
    parent_tenant_id?: string;
    message?: string;
    preferred_billing_mode?: "central" | "independent";
  },
  opts?: { tenantId: string },
): Promise<FranchiseJoinRequest> {
  return apiFetch("/tenants/hierarchy-requests", {
    method: "POST",
    body,
    tenantId: opts?.tenantId,
  });
}

export type FranchiseGovernanceMode =
  | "child_managed"
  | "parent_managed"
  | "hybrid"
  | "isolated";

export async function decideFranchiseJoinRequest(
  parentTenantId: string,
  requestId: string,
  body: {
    approve: boolean;
    billing_mode?: "central" | "independent";
    seat_allocations?: Record<string, number>;
    /** Required when approve=true (API validates). */
    governance_mode?: FranchiseGovernanceMode;
    governance?: Record<string, unknown>;
    rejection_reason?: string;
  },
): Promise<FranchiseJoinRequest> {
  return apiFetch(
    `/tenants/${parentTenantId}/hierarchy-requests/${requestId}/decision`,
    { method: "POST", tenantId: parentTenantId, body },
  );
}

export async function getChildOrganizationRollup(
  parentTenantId: string,
  childTenantId: string,
): Promise<{
  child_tenant_id: string;
  child_name: string;
  active_student_enrollments: number;
  active_instructor_memberships: number;
  active_classrooms: number;
  billing_mode?: string | null;
  governance_mode?: string | null;
}> {
  return apiFetch(
    `/tenants/${parentTenantId}/children/${childTenantId}/rollup`,
    { tenantId: parentTenantId },
  );
}

export interface SupportAccessUserOption {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  global_role?: string | null;
}

export interface SupportAccessRoleOption {
  id: string;
  slug: string;
  name: string;
}

export interface SupportAccessGrant {
  id: string;
  tenant_id: string;
  granted_by: string;
  support_user_id: string;
  role_id?: string | null;
  status: string;
  reason?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  revoked_by?: string | null;
  created_at: string;
}

export interface TenantMemberRecord {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id?: string | null;
  is_active: boolean;
  email: string;
  first_name: string;
  last_name: string;
  role_slug?: string | null;
}

export interface TenantRoleRecord {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  is_system: boolean;
  is_active: boolean;
}

export async function getSupportAccessOptions(id: string): Promise<{
  support_users: SupportAccessUserOption[];
  roles: SupportAccessRoleOption[];
}> {
  return apiFetch(`/tenants/${id}/support-access/options`);
}

export async function listSupportAccessGrants(id: string): Promise<{
  items: SupportAccessGrant[];
}> {
  return apiFetch(`/tenants/${id}/support-access`);
}

export async function createSupportAccessGrant(
  id: string,
  body: {
    support_user_id: string;
    role_id: string;
    reason?: string;
    expires_at: string;
  },
): Promise<SupportAccessGrant> {
  return apiFetch(`/tenants/${id}/support-access`, {
    method: "POST",
    body,
  });
}

export async function listTenantMembers(id: string): Promise<TenantMemberRecord[]> {
  return apiFetch<TenantMemberRecord[]>(`/tenants/${id}/members`);
}

/** All tenant roles (follows pagination until `total` is reached). */
export async function listTenantRoles(): Promise<TenantRoleRecord[]> {
  const limit = 100;
  let skip = 0;
  const all: TenantRoleRecord[] = [];
  for (;;) {
    const q = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    const page = await apiFetch<Paginated<TenantRoleRecord>>(`/roles/?${q}`);
    all.push(...page.items);
    if (page.items.length < limit || all.length >= page.total) break;
    skip += limit;
  }
  return all;
}

export async function addTenantMember(
  id: string,
  body: { user_id: string; role_id: string },
): Promise<{ id: string; user_id: string; role_id?: string | null }> {
  return apiFetch(`/tenants/${id}/members`, {
    method: "POST",
    body,
  });
}

export async function updateTenantMemberRole(
  id: string,
  userId: string,
  body: { role_id: string },
): Promise<{ id: string; role_id?: string | null }> {
  return apiFetch(`/tenants/${id}/members/${userId}`, {
    method: "PATCH",
    body,
  });
}

export async function removeTenantMember(
  id: string,
  userId: string,
): Promise<{ status: string }> {
  return apiFetch(`/tenants/${id}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function revokeSupportAccessGrant(
  id: string,
  grantId: string,
): Promise<SupportAccessGrant> {
  return apiFetch(`/tenants/${id}/support-access/${grantId}/revoke`, {
    method: "PATCH",
  });
}
