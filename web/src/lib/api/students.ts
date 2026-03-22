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

export async function getParentChildrenSessions(
  limit?: number
): Promise<SessionResponse[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<SessionResponse[]>(
    `/students/parent/children-sessions${params}`
  );
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

export async function createStudent(payload: StudentCreatePayload): Promise<StudentProfile> {
  return apiFetch<StudentProfile>("/students/", {
    method: "POST",
    body: payload,
  });
}
