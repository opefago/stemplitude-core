import { apiFetch } from "./client";

export interface StudentLabProject {
  id: string;
  student_id: string;
  lab_id: string | null;
  tenant_id: string;
  title: string;
  blob_key: string | null;
  blob_url: string | null;
  metadata: Record<string, unknown> | null;
  submitted_at: string;
}

/** List saved projects for the current student (or a child in guardian context). */
export async function listStudentLabProjects(
  opts?: {
    lab_id?: string;
    limit?: number;
    skip?: number;
    childContextOverride?: string | null;
  },
): Promise<StudentLabProject[]> {
  const q = new URLSearchParams();
  if (opts?.lab_id) q.set("lab_id", opts.lab_id);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  const qs = q.toString();
  return apiFetch<StudentLabProject[]>(`/labs/projects${qs ? `?${qs}` : ""}`, {
    childContextOverride: opts?.childContextOverride,
  });
}
