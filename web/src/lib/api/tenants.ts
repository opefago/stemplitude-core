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
}

/** Create a new organization; caller becomes admin. Omit tenant header. */
export async function createTenant(payload: CreateTenantPayload): Promise<TenantInfo> {
  const data = await apiFetch<{
    id: string;
    name: string;
    slug: string;
    code: string;
    type: string;
    logo_url?: string;
    settings?: Record<string, unknown>;
  }>("/tenants/", {
    method: "POST",
    body: payload,
    skipTenantHeader: true,
  });
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    code: data.code,
    type: data.type,
    logoUrl: data.logo_url,
    settings: data.settings,
  };
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  code: string;
  type: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
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
  }>(`/tenants/${id}`, { tenantId: id });
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    code: data.code,
    type: data.type,
    logoUrl: data.logo_url,
    settings: data.settings,
  };
}

export async function updateTenantSettings(
  tenantId: string,
  settings: Record<string, unknown>,
): Promise<TenantInfo> {
  const data = await apiFetch<{
    id: string;
    name: string;
    slug: string;
    code: string;
    type: string;
    logo_url?: string;
    settings?: Record<string, unknown>;
  }>(`/tenants/${tenantId}`, {
    method: "PATCH",
    tenantId,
    body: { settings },
  });
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    code: data.code,
    type: data.type,
    logoUrl: data.logo_url,
    settings: data.settings,
  };
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
