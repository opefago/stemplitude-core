import { apiFetch } from "./client";

export interface UserRecord {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  items: UserRecord[];
  total: number;
}

export async function listUsers(params: {
  skip?: number;
  limit?: number;
  search?: string;
} = {}): Promise<UserListResponse> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.search) qs.set("search", params.search);
  const query = qs.toString();
  return apiFetch<UserListResponse>(`/users/${query ? `?${query}` : ""}`);
}
