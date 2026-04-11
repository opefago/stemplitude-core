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
  save_kind: string;
  revision: number;
  source_project_id: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface ExploreGameCard {
  id: string;
  title: string;
  creator_name: string;
  creator_avatar_url: string | null;
  icon_url: string | null;
  play_url: string | null;
  published_at: string;
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

/** Public Explore feed; does not require auth or tenant header. */
export async function listExploreGameCards(opts?: {
  limit?: number;
  skip?: number;
}): Promise<ExploreGameCard[]> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  const qs = q.toString();
  return apiFetch<ExploreGameCard[]>(`/labs/projects/explore${qs ? `?${qs}` : ""}`, {
    skipAuth: true,
    skipTenantHeader: true,
  });
}

/** Fetch a single project by ID (includes blob_url for downloading the snapshot). */
export async function getLabProject(
  projectId: string,
): Promise<StudentLabProject> {
  return apiFetch<StudentLabProject>(`/labs/projects/${projectId}`);
}

/** List all projects created during a classroom session. */
export async function listSessionProjects(
  sessionId: string,
  opts?: { classroomId?: string; limit?: number; skip?: number },
): Promise<StudentLabProject[]> {
  const q = new URLSearchParams();
  if (opts?.classroomId) q.set("classroom_id", opts.classroomId);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  const qs = q.toString();
  return apiFetch<StudentLabProject[]>(
    `/labs/projects/by-session/${sessionId}${qs ? `?${qs}` : ""}`,
  );
}

export async function createLabProject(params: {
  title: string;
  lab_id?: string | null;
  file: Blob | File;
  filename: string;
  metadata?: Record<string, unknown> | null;
  save_kind?: "autosave" | "checkpoint";
  source_project_id?: string | null;
}): Promise<StudentLabProject> {
  const form = new FormData();
  form.set("title", params.title);
  if (params.lab_id) form.set("lab_id", params.lab_id);
  if (params.metadata != null) form.set("metadata_json", JSON.stringify(params.metadata));
  if (params.save_kind) form.set("save_kind", params.save_kind);
  if (params.source_project_id) form.set("source_project_id", params.source_project_id);
  form.set("file", params.file, params.filename);
  return apiFetch<StudentLabProject>("/labs/projects/", {
    method: "POST",
    body: form,
  });
}

export async function updateLabProject(
  projectId: string,
  params: {
    title?: string;
    metadata?: Record<string, unknown> | null;
    save_kind?: "autosave" | "checkpoint";
    expected_revision?: number;
    file?: Blob | File;
    filename?: string;
  },
): Promise<StudentLabProject> {
  const form = new FormData();
  if (params.title != null) form.set("title", params.title);
  if (params.metadata != null) form.set("metadata_json", JSON.stringify(params.metadata));
  if (params.save_kind) form.set("save_kind", params.save_kind);
  if (params.expected_revision != null) {
    form.set("expected_revision", String(params.expected_revision));
  }
  if (params.file) {
    form.set("file", params.file, params.filename || "project.json");
  }
  return apiFetch<StudentLabProject>(`/labs/projects/${projectId}`, {
    method: "PATCH",
    body: form,
  });
}

export async function createLabProjectCheckpoint(
  projectId: string,
  params: {
    title: string;
    lab_id?: string | null;
    file: Blob | File;
    filename: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<StudentLabProject> {
  const form = new FormData();
  form.set("title", params.title);
  if (params.lab_id) form.set("lab_id", params.lab_id);
  if (params.metadata != null) form.set("metadata_json", JSON.stringify(params.metadata));
  form.set("file", params.file, params.filename);
  return apiFetch<StudentLabProject>(`/labs/projects/${projectId}/checkpoints`, {
    method: "POST",
    body: form,
  });
}

export async function listLabProjectRevisions(
  projectId: string,
  opts?: { limit?: number; skip?: number },
): Promise<StudentLabProject[]> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  const qs = q.toString();
  return apiFetch<StudentLabProject[]>(
    `/labs/projects/${projectId}/revisions${qs ? `?${qs}` : ""}`,
  );
}
