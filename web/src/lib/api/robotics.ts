import { apiFetch } from "./client";
import type {
  RoboticsAttemptRecord,
  RoboticsCapabilityManifest,
  RoboticsEventRecord,
  RoboticsProjectDocument,
} from "../robotics";

export interface RoboticsProjectRecord {
  id: string;
  tenant_id: string;
  student_id: string;
  title: string;
  robot_vendor: string;
  robot_type: string;
  mode: "blocks" | "hybrid" | "python" | "cpp";
  schema_version: number;
  editor_mode?: "code" | "sim" | "split";
  project_source?: "manual" | "curriculum_lab" | "track_lesson_resource" | "default";
  source: RoboticsProjectDocument["source"];
  world_scene?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRoboticsProjectInput {
  title: string;
  robot_vendor: string;
  robot_type: string;
  mode: RoboticsProjectRecord["mode"];
  schema_version: number;
  editor_mode?: RoboticsProjectRecord["editor_mode"];
  project_source?: RoboticsProjectRecord["project_source"];
  source: RoboticsProjectDocument["source"];
  world_scene?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateRoboticsProjectInput {
  title?: string;
  mode?: RoboticsProjectRecord["mode"];
  schema_version?: number;
  editor_mode?: RoboticsProjectRecord["editor_mode"];
  project_source?: RoboticsProjectRecord["project_source"];
  source?: RoboticsProjectDocument["source"];
  world_scene?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ResolveRoboticsTemplateInput {
  curriculum_lab_id?: string;
  lesson_id?: string;
  assignment_id?: string;
}

export interface RoboticsResolvedTemplate {
  source: "curriculum_lab" | "track_lesson_resource" | "default";
  source_id?: string | null;
  title: string;
  robot_vendor: string;
  robot_type: string;
  mode: RoboticsProjectRecord["mode"];
  source_payload: RoboticsProjectDocument["source"];
  world_scene?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface CreateRoboticsAttemptInput {
  mission_id: string;
  run_mode: "simulate" | "hardware_export";
  seed?: number;
  telemetry?: Record<string, unknown>;
}

export interface CreateRoboticsCompileJobInput {
  robot_vendor: string;
  robot_type: string;
  language: "python" | "cpp";
  source_code: string;
  target?: string;
}

export interface RoboticsCompileJobRecord {
  id: string;
  tenant_id: string;
  requested_by: string;
  robot_vendor: string;
  robot_type: string;
  language: "python" | "cpp";
  target: string;
  status: "queued" | "running" | "completed" | "failed";
  provider: string;
  artifact_name?: string | null;
  artifact_content_type?: string | null;
  artifact_content_base64?: string | null;
  diagnostics: string[];
  created_at: string;
  updated_at: string;
}

export async function listRoboticsCapabilityManifests(): Promise<RoboticsCapabilityManifest[]> {
  return apiFetch<RoboticsCapabilityManifest[]>("/robotics/manifests");
}

export async function createRoboticsProject(
  input: CreateRoboticsProjectInput,
): Promise<RoboticsProjectRecord> {
  return apiFetch<RoboticsProjectRecord>("/robotics/projects", {
    method: "POST",
    body: input,
  });
}

export async function listRoboticsProjects(opts?: {
  student_id?: string;
  assignment_id?: string;
  skip?: number;
  limit?: number;
}): Promise<RoboticsProjectRecord[]> {
  const q = new URLSearchParams();
  if (opts?.student_id) q.set("student_id", opts.student_id);
  if (opts?.assignment_id) q.set("assignment_id", opts.assignment_id);
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<RoboticsProjectRecord[]>(`/robotics/projects${qs ? `?${qs}` : ""}`);
}

export async function getRoboticsProject(projectId: string): Promise<RoboticsProjectRecord> {
  return apiFetch<RoboticsProjectRecord>(`/robotics/projects/${projectId}`);
}

export async function updateRoboticsProject(
  projectId: string,
  input: UpdateRoboticsProjectInput,
): Promise<RoboticsProjectRecord> {
  return apiFetch<RoboticsProjectRecord>(`/robotics/projects/${projectId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function createRoboticsAttempt(
  projectId: string,
  input: CreateRoboticsAttemptInput,
): Promise<RoboticsAttemptRecord> {
  return apiFetch<RoboticsAttemptRecord>(`/robotics/projects/${projectId}/attempts`, {
    method: "POST",
    body: input,
  });
}

export async function listRoboticsAttempts(projectId: string): Promise<RoboticsAttemptRecord[]> {
  return apiFetch<RoboticsAttemptRecord[]>(`/robotics/projects/${projectId}/attempts`);
}

export async function ingestRoboticsEvents(events: RoboticsEventRecord[]): Promise<{ accepted_count: number }> {
  return apiFetch<{ accepted_count: number }>("/robotics/events/ingest", {
    method: "POST",
    body: { events },
  });
}

export async function resolveRoboticsTemplate(
  input: ResolveRoboticsTemplateInput,
): Promise<RoboticsResolvedTemplate> {
  const q = new URLSearchParams();
  if (input.curriculum_lab_id) q.set("curriculum_lab_id", input.curriculum_lab_id);
  if (input.lesson_id) q.set("lesson_id", input.lesson_id);
  if (input.assignment_id) q.set("assignment_id", input.assignment_id);
  const qs = q.toString();
  return apiFetch<RoboticsResolvedTemplate>(`/robotics/templates/resolve${qs ? `?${qs}` : ""}`);
}

export async function createRoboticsCompileJob(
  input: CreateRoboticsCompileJobInput,
): Promise<RoboticsCompileJobRecord> {
  return apiFetch<RoboticsCompileJobRecord>("/robotics/compile/jobs", {
    method: "POST",
    body: input,
  });
}

export async function getRoboticsCompileJob(jobId: string): Promise<RoboticsCompileJobRecord> {
  return apiFetch<RoboticsCompileJobRecord>(`/robotics/compile/jobs/${jobId}`);
}

// --- World API ---

export interface RoboticsWorldRecord {
  id: string;
  tenant_id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  world_scene: Record<string, unknown>;
  start_pose?: Record<string, unknown> | null;
  runtime_settings: Record<string, unknown>;
  mission?: Record<string, unknown> | null;
  is_template: boolean;
  share_code?: string | null;
  visibility: "private" | "tenant" | "public";
  difficulty?: "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  width_cells: number;
  height_cells: number;
  object_count: number;
  play_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRoboticsWorldInput {
  title: string;
  description?: string;
  world_scene: Record<string, unknown>;
  start_pose?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  mission?: Record<string, unknown>;
  visibility?: "private" | "tenant" | "public";
  difficulty?: "beginner" | "intermediate" | "advanced";
  tags?: string[];
  width_cells?: number;
  height_cells?: number;
}

export interface UpdateRoboticsWorldInput {
  title?: string;
  description?: string;
  world_scene?: Record<string, unknown>;
  start_pose?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  mission?: Record<string, unknown>;
  visibility?: "private" | "tenant" | "public";
  difficulty?: "beginner" | "intermediate" | "advanced";
  tags?: string[];
  width_cells?: number;
  height_cells?: number;
}

export interface RoboticsWorldGalleryItem {
  id: string;
  title: string;
  description?: string | null;
  difficulty?: string | null;
  tags: string[];
  width_cells: number;
  height_cells: number;
  object_count: number;
  play_count: number;
  creator_name?: string | null;
  share_code?: string | null;
  created_at: string;
}

export interface RoboticsLeaderboardEntry {
  attempt_id: string;
  student_id: string;
  student_name?: string | null;
  score: number;
  time_ms?: number | null;
  path_length_cm?: number | null;
  checkpoints_hit?: number | null;
  created_at: string;
}

export async function createRoboticsWorld(input: CreateRoboticsWorldInput): Promise<RoboticsWorldRecord> {
  return apiFetch<RoboticsWorldRecord>("/robotics/worlds", { method: "POST", body: input });
}

export async function listRoboticsWorlds(opts?: { skip?: number; limit?: number }): Promise<RoboticsWorldRecord[]> {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<RoboticsWorldRecord[]>(`/robotics/worlds${qs ? `?${qs}` : ""}`);
}

export async function getRoboticsWorld(worldId: string): Promise<RoboticsWorldRecord> {
  return apiFetch<RoboticsWorldRecord>(`/robotics/worlds/${worldId}`);
}

export async function getRoboticsWorldByShareCode(shareCode: string): Promise<RoboticsWorldRecord> {
  return apiFetch<RoboticsWorldRecord>(`/robotics/worlds/code/${shareCode}`);
}

export async function updateRoboticsWorld(worldId: string, input: UpdateRoboticsWorldInput): Promise<RoboticsWorldRecord> {
  return apiFetch<RoboticsWorldRecord>(`/robotics/worlds/${worldId}`, { method: "PATCH", body: input });
}

export async function listRoboticsWorldGallery(opts?: {
  difficulty?: string;
  search?: string;
  skip?: number;
  limit?: number;
}): Promise<RoboticsWorldGalleryItem[]> {
  const q = new URLSearchParams();
  if (opts?.difficulty) q.set("difficulty", opts.difficulty);
  if (opts?.search) q.set("search", opts.search);
  if (opts?.skip != null) q.set("skip", String(opts.skip));
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<RoboticsWorldGalleryItem[]>(`/robotics/worlds/gallery${qs ? `?${qs}` : ""}`);
}

export async function getRoboticsWorldLeaderboard(worldId: string, opts?: { limit?: number }): Promise<RoboticsLeaderboardEntry[]> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<RoboticsLeaderboardEntry[]>(`/robotics/worlds/${worldId}/leaderboard${qs ? `?${qs}` : ""}`);
}

