import { apiFetch } from "./client";
import type { ClassroomRecord } from "./classrooms";

export interface StudentProfile {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  display_name?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
  global_account: boolean;
  is_active: boolean;
}

export interface StudentCreatePayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  password: string;
  display_name?: string | null;
  date_of_birth?: string | null;
  username?: string | null;
  grade_level?: string | null;
}

export interface SessionResponse {
  id: string;
  classroom_id: string;
  session_start: string;
  session_end: string;
  status: string;
  meeting_link?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface StudentAssignment {
  id: string;
  title: string;
  description: string;
  instructions?: string | null;
  due_at?: string | null;
  lab_id?: string | null;
  classroom_id: string;
  classroom_name: string;
  session_id: string;
  session_start: string;
  session_end: string;
  session_status: string;
  submission_status?: "draft" | "submitted" | null;
}

export async function getMyUpcomingSessions(
  limit?: number
): Promise<SessionResponse[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<SessionResponse[]>(`/students/me/upcoming-sessions${params}`);
}

export async function getMyActiveSessions(
  limit?: number
): Promise<SessionResponse[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<SessionResponse[]>(`/students/me/active-sessions${params}`);
}

export async function getMyAssignments(
  limit?: number
): Promise<StudentAssignment[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<StudentAssignment[]>(`/students/me/assignments${params}`);
}

export async function getMyClassrooms(): Promise<ClassroomRecord[]> {
  return apiFetch<ClassroomRecord[]>("/students/me/classrooms");
}

export type ParentActivityKind =
  | "lesson_completed"
  | "lab_completed"
  | "assignment_submitted"
  | "sticker_earned"
  | "xp_earned"
  | "attendance";

export interface ParentActivityItem {
  kind: ParentActivityKind;
  occurred_at: string;
  title: string;
  detail?: string | null;
  ref_id?: string | null;
  classroom_id?: string | null;
  class_name?: string | null;
}

export interface ParentWeeklyDigest {
  period_start: string;
  period_end: string;
  lessons_completed: number;
  labs_completed: number;
  badges_earned: number;
  xp_earned: number;
  sessions_attended: number;
  assignments_submitted?: number;
}

export interface ParentChildActivity {
  items: ParentActivityItem[];
  weekly_digest: ParentWeeklyDigest;
  total: number;
  skip: number;
  limit: number;
}

export async function getParentChildActivity(
  studentId: string,
  params?: { skip?: number; limit?: number },
): Promise<ParentChildActivity> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ParentChildActivity>(
    `/students/parent/children/${encodeURIComponent(studentId)}/activity${qs ? `?${qs}` : ""}`,
  );
}

export async function getParentChildrenSessions(
  limit?: number,
  studentId?: string | null
): Promise<SessionResponse[]> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (studentId) qs.set("student_id", studentId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<SessionResponse[]>(
    `/students/parent/children-sessions${suffix}`
  );
}

/** Linked children (school parent) or tenant students (homeschool operator). */
export async function getParentChildren(): Promise<StudentProfile[]> {
  return apiFetch<StudentProfile[]>("/students/parent/children");
}

export async function listStudents(params: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
} = {}): Promise<StudentProfile[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString();
  return apiFetch<StudentProfile[]>(`/students/${query ? `?${query}` : ""}`);
}

/** Guardian links for a learner (tenant-scoped); includes email when available. */
export interface StudentParentLink {
  id: string;
  user_id: string;
  student_id: string;
  relationship: string;
  is_primary_contact: boolean;
  user_email?: string | null;
}

export async function listStudentParents(studentId: string): Promise<StudentParentLink[]> {
  return apiFetch<StudentParentLink[]>(
    `/students/${encodeURIComponent(studentId)}/parents`,
  );
}

export async function createStudent(payload: StudentCreatePayload): Promise<StudentProfile> {
  return apiFetch<StudentProfile>("/students/", {
    method: "POST",
    body: payload,
  });
}
