import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export interface PermissionRecord {
  id: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface RoleRecord {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  is_system: boolean;
  is_active: boolean;
}

export interface RoleWithPermissions extends RoleRecord {
  permissions: PermissionRecord[];
}

export interface CreateRoleBody {
  name: string;
  slug?: string;
  is_active?: boolean;
}

export interface UpdateRoleBody {
  name?: string;
  is_active?: boolean;
}

/** All permission rows (follows pagination until `total` is reached). */
export async function listPermissions(): Promise<PermissionRecord[]> {
  const limit = 200;
  let skip = 0;
  const all: PermissionRecord[] = [];
  for (;;) {
    const q = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    const page = await apiFetch<Paginated<PermissionRecord>>(
      `/roles/permissions?${q}`,
    );
    all.push(...page.items);
    if (page.items.length < limit || all.length >= page.total) break;
    skip += limit;
  }
  return all;
}

export async function getRole(id: string): Promise<RoleWithPermissions> {
  return apiFetch<RoleWithPermissions>(`/roles/${id}`);
}

export async function createRole(body: CreateRoleBody): Promise<RoleRecord> {
  return apiFetch<RoleRecord>("/roles/", { method: "POST", body });
}

export async function updateRole(id: string, body: UpdateRoleBody): Promise<RoleRecord> {
  return apiFetch<RoleRecord>(`/roles/${id}`, { method: "PATCH", body });
}

export async function deleteRole(id: string): Promise<void> {
  await apiFetch(`/roles/${id}`, { method: "DELETE" });
}

export async function assignPermissions(
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  await apiFetch(`/roles/${roleId}/permissions`, {
    method: "POST",
    body: { permission_ids: permissionIds },
  });
}

export async function revokePermission(
  roleId: string,
  permissionId: string,
): Promise<void> {
  await apiFetch(`/roles/${roleId}/permissions/${permissionId}`, {
    method: "DELETE",
  });
}
