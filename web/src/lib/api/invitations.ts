import { apiFetch } from "./client";

export interface InvitationResponse {
  id: string;
  token: string;
  invite_type: "user" | "parent";
  email: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  role_id: string | null;
  role_name: string | null;
  student_names: string[] | null;
  invite_link: string;
}

export interface InvitationListResponse {
  items: InvitationResponse[];
  total: number;
}

export interface ValidateInviteResponse {
  token: string;
  invite_type: "user" | "parent";
  email: string;
  tenant_name: string;
  tenant_id: string;
  inviter_name: string;
  role_name: string | null;
  student_names: string[] | null;
  expires_at: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

export interface AcceptInviteResponse {
  message: string;
  tenant_id: string;
  invite_type: string;
}

export async function createUserInvite(data: {
  email: string;
  role_id: string;
  first_name?: string;
  personal_message?: string;
}): Promise<InvitationResponse> {
  return apiFetch<InvitationResponse>("/invitations/users", {
    method: "POST",
    body: data,
  });
}

export async function createParentInvite(data: {
  email: string;
  student_ids: string[];
  first_name?: string;
}): Promise<InvitationResponse> {
  return apiFetch<InvitationResponse>("/invitations/parents", {
    method: "POST",
    body: data,
  });
}

export async function listInvitations(params?: {
  skip?: number;
  limit?: number;
}): Promise<InvitationListResponse> {
  const qs = new URLSearchParams();
  if (params?.skip != null) qs.set("skip", String(params.skip));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  return apiFetch<InvitationListResponse>(`/invitations/?${qs}`);
}

export async function validateInviteToken(token: string): Promise<ValidateInviteResponse> {
  return fetch(`/api/v1/invitations/validate/${token}`).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? "Invalid or expired invitation");
    }
    return res.json() as Promise<ValidateInviteResponse>;
  });
}

export async function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  return apiFetch<AcceptInviteResponse>(`/invitations/accept/${token}`, {
    method: "POST",
  });
}

export async function revokeInvite(token: string): Promise<void> {
  await apiFetch<void>(`/invitations/${token}`, { method: "DELETE" });
}
