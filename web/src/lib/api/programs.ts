import { apiFetch } from "./client";

export interface Program {
  id: string;
  tenant_id?: string;
  name: string;
  description: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramCreatePayload {
  name: string;
  description?: string | null;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ProgramUpdatePayload {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

export async function listPrograms(params: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
} = {}): Promise<Program[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString();
  return apiFetch<Program[]>(`/programs/${query ? `?${query}` : ""}`);
}

export async function createProgram(payload: ProgramCreatePayload): Promise<Program> {
  return apiFetch<Program>("/programs/", {
    method: "POST",
    body: payload,
  });
}

export async function getProgram(id: string): Promise<Program> {
  return apiFetch<Program>(`/programs/${id}`);
}

export async function updateProgram(id: string, payload: ProgramUpdatePayload): Promise<Program> {
  return apiFetch<Program>(`/programs/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function archiveProgram(id: string): Promise<Program> {
  return updateProgram(id, { is_active: false });
}
