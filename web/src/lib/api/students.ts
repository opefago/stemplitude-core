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
  /** Set when listing children in a tenant (membership grade). */
  grade_level?: string | null;
}

export type GuardianMessagingScope = "instructors_only" | "classmates" | "disabled";

export interface GuardianChildControls {
  student_id: string;
  messaging_scope: GuardianMessagingScope;
  allow_public_game_publishing: boolean;
  grade_level: string | null;
  has_parent_link: boolean;
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
  classroom_name?: string | null;
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
  lab_launcher_id?: string | null;
  curriculum_lab_title?: string | null;
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
  limit?: number,
  opts?: { childContextOverride?: string | null },
): Promise<StudentAssignment[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<StudentAssignment[]>(`/students/me/assignments${params}`, {
    childContextOverride: opts?.childContextOverride,
  });
}

export async function getParentChildAssignments(
  studentId: string,
  limit?: number,
): Promise<StudentAssignment[]> {
  const params = limit != null ? `?limit=${limit}` : "";
  return apiFetch<StudentAssignment[]>(
    `/students/parent/children/${encodeURIComponent(studentId)}/assignments${params}`,
  );
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

export interface ParentEnrolledClassroomRef {
  id: string;
  name: string;
}

export interface ParentChildActivity {
  items: ParentActivityItem[];
  weekly_digest: ParentWeeklyDigest;
  enrolled_classrooms: ParentEnrolledClassroomRef[];
  total: number;
  skip: number;
  limit: number;
}

export type GetParentChildActivityParams = {
  skip?: number;
  limit?: number;
  /** ISO 8601 datetime (inclusive lower bound). */
  occurred_after?: string;
  /** ISO 8601 datetime (inclusive upper bound). */
  occurred_before?: string;
  activity_kind?: ParentActivityKind;
  without_classroom?: boolean;
  classroom_id?: string;
};

export interface ParentAssignmentGradeRow {
  graded_at: string;
  score: number;
  feedback?: string | null;
  assignment_id?: string | null;
  classroom_id: string;
  classroom_name: string;
  session_id: string;
  session_start: string;
  session_end: string;
  session_display_title?: string | null;
  rubric?: Record<string, unknown>[] | null;
}

export interface ParentChildAssignmentGrades {
  grades: ParentAssignmentGradeRow[];
  total: number;
  skip: number;
  limit: number;
}

export type GetParentChildAssignmentGradesParams = {
  skip?: number;
  limit?: number;
  graded_after?: string;
  graded_before?: string;
  classroom_id?: string;
};

export async function getParentChildAssignmentGrades(
  studentId: string,
  params?: GetParentChildAssignmentGradesParams,
): Promise<ParentChildAssignmentGrades> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  if (params?.graded_after) query.set("graded_after", params.graded_after);
  if (params?.graded_before) query.set("graded_before", params.graded_before);
  if (params?.classroom_id) query.set("classroom_id", params.classroom_id);
  const qs = query.toString();
  return apiFetch<ParentChildAssignmentGrades>(
    `/students/parent/children/${encodeURIComponent(studentId)}/assignment-grades${qs ? `?${qs}` : ""}`,
  );
}

export async function getParentChildActivity(
  studentId: string,
  params?: GetParentChildActivityParams,
): Promise<ParentChildActivity> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  if (params?.occurred_after)
    query.set("occurred_after", params.occurred_after);
  if (params?.occurred_before)
    query.set("occurred_before", params.occurred_before);
  if (params?.activity_kind)
    query.set("activity_kind", params.activity_kind);
  if (params?.without_classroom) query.set("without_classroom", "true");
  if (params?.classroom_id)
    query.set("classroom_id", params.classroom_id);
  const qs = query.toString();
  return apiFetch<ParentChildActivity>(
    `/students/parent/children/${encodeURIComponent(studentId)}/activity${qs ? `?${qs}` : ""}`,
  );
}

/**
 * ISO instant (UTC): local midnight at the start of the calendar month that is
 * `offsetMonths` after the current month (`1` = next month’s 1st, exclusive end of “this month” only).
 */
export function sessionStartBeforeExclusiveLocalMonthStartOffset(
  offsetMonths: number,
): string {
  return localMonthStartFromDateMonthsOffset(new Date(), offsetMonths).toISOString();
}

/** Local midnight at month start: ``ref``’s month + ``offsetMonths``. */
export function localMonthStartFromDateMonthsOffset(
  ref: Date,
  offsetMonths: number,
): Date {
  return new Date(
    ref.getFullYear(),
    ref.getMonth() + offsetMonths,
    1,
    0,
    0,
    0,
    0,
  );
}

/** Exclusive end of “this calendar month” only (parent dashboard widget, etc.). */
export function sessionStartBeforeExclusiveLocalNextMonth(): string {
  return sessionStartBeforeExclusiveLocalMonthStartOffset(1);
}

/**
 * Parent Events hub: include this month and all of the next calendar month so
 * “next 7 days” can cross month boundaries and “later” is not empty in the last week of the month.
 */
export const PARENT_EVENTS_UPCOMING_EXCLUSIVE_MONTH_OFFSET = 2;

export function sessionStartBeforeForParentEventsHub(): string {
  return sessionStartBeforeExclusiveLocalMonthStartOffset(
    PARENT_EVENTS_UPCOMING_EXCLUSIVE_MONTH_OFFSET,
  );
}

/** Exclusive instant: current time + ``days`` (rolling). Pairs with upcoming sessions API as an upper bound. */
export function sessionStartBeforeExclusiveRollingDaysFromNow(days: number): string {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export async function getParentChildrenSessions(
  limit?: number,
  studentId?: string | null,
  timeScope: "upcoming" | "past" = "upcoming",
  options?: {
    sessionStartBefore?: string | null;
    /** With sessionStartBefore: fetch a full merged month (Events hub), not only the first `limit` occurrences. */
    expandMonthSessions?: boolean;
  },
): Promise<SessionResponse[]> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (studentId) qs.set("student_id", studentId);
  qs.set("time_scope", timeScope);
  if (timeScope === "upcoming" && options?.sessionStartBefore) {
    qs.set("session_start_before", options.sessionStartBefore);
  }
  if (timeScope === "upcoming" && options?.expandMonthSessions) {
    qs.set("expand_month_sessions", "true");
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<SessionResponse[]>(
    `/students/parent/children-sessions${suffix}`
  );
}

/** Linked children (school parent) or tenant students (homeschool operator). */
export async function getParentChildren(): Promise<StudentProfile[]> {
  return apiFetch<StudentProfile[]>("/students/parent/children");
}

export async function getGuardianChildControls(
  studentId: string,
): Promise<GuardianChildControls> {
  return apiFetch<GuardianChildControls>(
    `/students/parent/children/${encodeURIComponent(studentId)}/controls`,
  );
}

export async function patchGuardianChildControls(
  studentId: string,
  body: Partial<{
    messaging_scope: GuardianMessagingScope;
    allow_public_game_publishing: boolean;
    grade_level: string | null;
  }>,
): Promise<GuardianChildControls> {
  return apiFetch<GuardianChildControls>(
    `/students/parent/children/${encodeURIComponent(studentId)}/controls`,
    {
      method: "PATCH",
      body,
    },
  );
}

export async function unlinkGuardianChildLink(studentId: string): Promise<void> {
  await apiFetch<void>(
    `/students/parent/children/${encodeURIComponent(studentId)}/link`,
    { method: "DELETE" },
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

/** Guardian attendance hub: class sessions with attendance + excusal state. */
export interface GuardianExcusalSummary {
  id: string;
  status: string;
  reason: string;
  review_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface GuardianAttendanceSessionRow {
  session_id: string;
  classroom_id: string;
  classroom_name: string;
  session_start: string;
  session_end: string;
  session_status: string;
  attendance_status?: string | null;
  attendance_notes?: string | null;
  excusal?: GuardianExcusalSummary | null;
}

export interface GuardianAttendanceOverview {
  rows: GuardianAttendanceSessionRow[];
}

export async function getParentChildAttendanceOverview(
  studentId: string,
): Promise<GuardianAttendanceOverview> {
  return apiFetch<GuardianAttendanceOverview>(
    `/students/parent/children/${encodeURIComponent(studentId)}/attendance-overview`,
  );
}

export async function createParentExcusalRequest(
  studentId: string,
  body: {
    session_id: string;
    classroom_id: string;
    session_start?: string;
    session_end?: string;
    reason: string;
  },
): Promise<unknown> {
  return apiFetch(
    `/students/parent/children/${encodeURIComponent(studentId)}/excusal-requests`,
    { method: "POST", body },
  );
}

export interface AttendanceExcusalStaffRow {
  id: string;
  student_id: string;
  student_display_name: string;
  session_id: string;
  classroom_id: string;
  classroom_name: string;
  reason: string;
  status: string;
  submitted_by_user_id: string;
  review_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
}

export async function listAttendanceExcusalRequestsStaff(params?: {
  status?: string;
  skip?: number;
  limit?: number;
}): Promise<AttendanceExcusalStaffRow[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status_filter", params.status);
  if (params?.skip != null) qs.set("skip", String(params.skip));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<AttendanceExcusalStaffRow[]>(
    `/students/attendance-excusal-requests${suffix}`,
  );
}

export async function reviewAttendanceExcusalRequest(
  excusalId: string,
  body: { decision: "approved" | "denied"; review_notes?: string | null },
): Promise<AttendanceExcusalStaffRow> {
  return apiFetch<AttendanceExcusalStaffRow>(
    `/students/attendance-excusal-requests/${encodeURIComponent(excusalId)}`,
    { method: "PATCH", body },
  );
}
