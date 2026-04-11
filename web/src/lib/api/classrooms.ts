import { apiFetch, browserCalendarTimeZone } from "./client";
import { getAccessToken } from "../tokens";
import { ensureFreshAccessToken } from "./client";

export interface ClassroomRecord {
  id: string;
  tenant_id: string;
  name: string;
  program_id?: string | null;
  curriculum_id?: string | null;
  program_name?: string | null;
  program_start_date?: string | null;
  program_end_date?: string | null;
  curriculum_title?: string | null;
  instructor_id?: string | null;
  mode: "online" | "in-person" | "hybrid";
  recurrence_type?: string | null;
  meeting_provider?: string | null;
  meeting_link?: string | null;
  location_address?: string | null;
  schedule?: Record<string, unknown> | null;
  starts_at?: string | null;
  ends_at?: string | null;
  recurrence_rule?: string | null;
  timezone?: string | null;
  max_students?: number | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  join_code: string;
  external_meeting_id?: string | null;
  meeting_auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionTextAssignment {
  id: string;
  title: string;
  instructions?: string | null;
  due_at?: string | null;
  lab_id?: string | null;
  /** Playground launcher id when ``lab_id`` is a curriculum UUID (from API). */
  lab_launcher_id?: string | null;
  curriculum_lab_title?: string | null;
  requires_lab?: boolean;
  requires_assets?: boolean;
  allow_edit_after_submit?: boolean;
  created_by_id?: string | null;
  created_by_type?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
}

export interface SessionResourceEntry {
  asset_id: string;
  name?: string | null;
  source?: string | null;
  attached_by_id?: string | null;
  attached_by_type?: string | null;
  attached_by_name?: string | null;
  attached_at?: string | null;
}

export interface ClassroomSessionRecord {
  id: string;
  classroom_id: string;
  tenant_id: string;
  session_start: string;
  session_end: string;
  status: string;
  meeting_link?: string | null;
  external_meeting_id?: string | null;
  notes?: string | null;
  session_content?: {
    shared_asset_ids?: string[];
    downloadable_asset_ids?: string[];
    text_assignments?: SessionTextAssignment[];
    resource_entries?: SessionResourceEntry[];
  } | null;
  canceled_at?: string | null;
}

export interface SessionPresenceSummary {
  session_id: string;
  active_students: number;
  active_instructors: number;
  active_users: number;
  active_total: number;
  latest_seen_at?: string | null;
  auto_end_due_at?: string | null;
}

export interface SessionPresenceParticipant {
  actor_id: string;
  actor_type: "student" | "instructor" | "user" | string;
  display_name: string;
  email?: string | null;
  last_seen_at: string;
  in_lab?: boolean;
  lab_type?: string | null;
}

export interface SessionVideoToken {
  provider: string;
  room_name: string;
  participant_identity: string;
  participant_name: string;
  ws_url: string;
  token: string;
  expires_at: string;
}

export interface SessionRecordingRecord {
  id: string;
  tenant_id: string;
  classroom_id: string;
  session_id: string;
  created_by_id?: string | null;
  provider: string;
  provider_room_name?: string | null;
  provider_recording_id?: string | null;
  status: string;
  blob_key?: string | null;
  duration_seconds?: number | null;
  size_bytes?: number | null;
  retention_expires_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassroomSessionEventRecord {
  id: string;
  session_id: string;
  classroom_id: string;
  tenant_id: string;
  event_type: "chat" | "points_awarded" | "high_five" | "callout" | string;
  sequence?: number;
  correlation_id?: string | null;
  actor_id: string;
  actor_type: string;
  actor_display_name: string;
  student_id?: string | null;
  student_display_name?: string | null;
  message?: string | null;
  points_delta?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface RealtimeEventEnvelope {
  event_id: string;
  session_id: string;
  classroom_id: string;
  tenant_id: string;
  event_type: string;
  sequence: number;
  occurred_at: string;
  correlation_id?: string | null;
  actor: {
    id?: string;
    type?: string;
    display_name?: string;
  };
  payload: Record<string, unknown>;
}

export interface RealtimeSessionState {
  session_id: string;
  classroom_id: string;
  tenant_id: string;
  active_lab?: string | null;
  assignments: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  updated_at?: string | null;
}

export interface RealtimeSnapshot {
  session: ClassroomSessionRecord;
  presence: SessionPresenceSummary;
  participants: SessionPresenceParticipant[];
  state: RealtimeSessionState;
  latest_sequence: number;
  events: RealtimeEventEnvelope[];
}

export interface ClassroomStudentRecord {
  id: string;
  classroom_id: string;
  student_id: string;
  enrolled_at: string;
}

export interface ClassroomRosterStudentRecord {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  display_name?: string | null;
  enrolled_at: string;
}

export interface CreateClassroomPayload {
  name: string;
  program_id?: string | null;
  curriculum_id?: string | null;
  instructor_id?: string | null;
  mode: "online" | "in-person" | "hybrid";
  recurrence_type?: string | null;
  meeting_provider?: string | null;
  meeting_link?: string | null;
  location_address?: string | null;
  schedule?: Record<string, unknown> | null;
  starts_at?: string | null;
  ends_at?: string | null;
  recurrence_rule?: string | null;
  timezone?: string | null;
  max_students?: number | null;
  is_active?: boolean;
}

export interface CreateSessionPayload {
  session_start: string;
  session_end: string;
  meeting_link?: string | null;
  notes?: string | null;
}

export async function listClassrooms(params?: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
  program_id?: string;
  curriculum_id?: string;
}): Promise<ClassroomRecord[]> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  if (params?.is_active != null) query.set("is_active", String(params.is_active));
  if (params?.program_id) query.set("program_id", params.program_id);
  if (params?.curriculum_id) query.set("curriculum_id", params.curriculum_id);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<ClassroomRecord[]>(`/classrooms/${suffix}`);
}

export async function listMyClassrooms(): Promise<ClassroomRecord[]> {
  return apiFetch<ClassroomRecord[]>("/students/me/classrooms");
}

/** Parent / homeschool: classrooms their linked learners are enrolled in (not `/students/me/*`). */
export async function listGuardianLinkedClassrooms(): Promise<ClassroomRecord[]> {
  return apiFetch<ClassroomRecord[]>("/students/parent/linked-classrooms");
}

export async function checkDuplicateClassroomName(
  name: string,
  excludeClassroomId?: string,
): Promise<{ exists: boolean }> {
  const query = new URLSearchParams();
  query.set("name", name);
  if (excludeClassroomId) query.set("exclude_classroom_id", excludeClassroomId);
  return apiFetch<{ exists: boolean }>(`/classrooms/validate/name?${query.toString()}`);
}

export async function checkInstructorScheduleConflict(payload: {
  instructor_id: string;
  selected_days: string[];
  start_time: string;
  end_time: string;
  exclude_classroom_id?: string | null;
}): Promise<{ has_conflict: boolean; conflicting_classroom_ids: string[] }> {
  return apiFetch<{ has_conflict: boolean; conflicting_classroom_ids: string[] }>(
    "/classrooms/validate/instructor-conflict",
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function getClassroom(id: string): Promise<ClassroomRecord> {
  return apiFetch<ClassroomRecord>(`/classrooms/${id}`);
}

export async function getMyClassroom(id: string): Promise<ClassroomRecord> {
  return apiFetch<ClassroomRecord>(`/students/me/classrooms/${id}`);
}

export async function createClassroom(payload: CreateClassroomPayload): Promise<ClassroomRecord> {
  return apiFetch<ClassroomRecord>("/classrooms/", {
    method: "POST",
    body: payload,
  });
}

export async function listClassroomSessions(
  classroomId: string,
  limit = 100,
): Promise<ClassroomSessionRecord[]> {
  return apiFetch<ClassroomSessionRecord[]>(`/classrooms/${classroomId}/sessions?limit=${limit}`);
}

export async function listMyClassroomSessions(
  classroomId: string,
  limit = 100,
): Promise<ClassroomSessionRecord[]> {
  return apiFetch<ClassroomSessionRecord[]>(
    `/students/me/classrooms/${classroomId}/sessions?limit=${limit}`,
  );
}

export async function getMySessionRealtimeSnapshot(
  classroomId: string,
  sessionId: string,
  params?: { after_sequence?: number; replay_limit?: number },
): Promise<RealtimeSnapshot> {
  const query = new URLSearchParams();
  if (params?.after_sequence != null) query.set("after_sequence", String(params.after_sequence));
  if (params?.replay_limit != null) query.set("replay_limit", String(params.replay_limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<RealtimeSnapshot>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/snapshot${suffix}`,
  );
}

export async function listMySessionRealtimeEvents(
  classroomId: string,
  sessionId: string,
  params?: { after_sequence?: number; limit?: number },
): Promise<RealtimeEventEnvelope[]> {
  const query = new URLSearchParams();
  if (params?.after_sequence != null) query.set("after_sequence", String(params.after_sequence));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<RealtimeEventEnvelope[]>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/events${suffix}`,
  );
}

export async function createClassroomSession(
  classroomId: string,
  payload: CreateSessionPayload,
): Promise<ClassroomSessionRecord> {
  return apiFetch<ClassroomSessionRecord>(`/classrooms/${classroomId}/sessions`, {
    method: "POST",
    body: payload,
  });
}

export async function getClassroomSessionPresence(
  classroomId: string,
  sessionId: string,
): Promise<SessionPresenceSummary> {
  return apiFetch<SessionPresenceSummary>(`/classrooms/${classroomId}/sessions/${sessionId}/presence`);
}

export async function getMySessionPresence(
  classroomId: string,
  sessionId: string,
): Promise<SessionPresenceSummary> {
  return apiFetch<SessionPresenceSummary>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/presence`,
  );
}

export async function heartbeatClassroomSession(
  classroomId: string,
  sessionId: string,
  status: "active" | "left" = "active",
): Promise<SessionPresenceSummary> {
  return apiFetch<SessionPresenceSummary>(`/classrooms/${classroomId}/sessions/${sessionId}/presence`, {
    method: "POST",
    body: { status },
  });
}

export async function issueSessionVideoToken(
  classroomId: string,
  sessionId: string,
): Promise<SessionVideoToken> {
  return apiFetch<SessionVideoToken>(`/classrooms/${classroomId}/sessions/${sessionId}/video-token`, {
    method: "POST",
  });
}

export async function listSessionRecordings(
  classroomId: string,
  sessionId: string,
): Promise<SessionRecordingRecord[]> {
  return apiFetch<SessionRecordingRecord[]>(
    `/classrooms/${classroomId}/sessions/${sessionId}/recordings`,
  );
}

export async function startSessionRecording(
  classroomId: string,
  sessionId: string,
  payload?: { provider_recording_id?: string | null },
): Promise<SessionRecordingRecord> {
  return apiFetch<SessionRecordingRecord>(
    `/classrooms/${classroomId}/sessions/${sessionId}/recordings/start`,
    {
      method: "POST",
      body: payload ?? {},
    },
  );
}

export async function stopSessionRecording(
  classroomId: string,
  sessionId: string,
  recordingId: string,
  payload?: {
    status?: string;
    blob_key?: string | null;
    duration_seconds?: number | null;
    size_bytes?: number | null;
    provider_recording_id?: string | null;
  },
): Promise<SessionRecordingRecord> {
  return apiFetch<SessionRecordingRecord>(
    `/classrooms/${classroomId}/sessions/${sessionId}/recordings/${recordingId}/stop`,
    {
      method: "POST",
      body: payload ?? {},
    },
  );
}

export async function createRecordingAccessLink(
  classroomId: string,
  sessionId: string,
  recordingId: string,
): Promise<{ recording_id: string; download_url: string; expires_in_seconds: number }> {
  return apiFetch<{ recording_id: string; download_url: string; expires_in_seconds: number }>(
    `/classrooms/${classroomId}/sessions/${sessionId}/recordings/${recordingId}/access-link`,
    {
      method: "POST",
    },
  );
}

export async function deleteSessionRecording(
  classroomId: string,
  sessionId: string,
  recordingId: string,
): Promise<SessionRecordingRecord> {
  return apiFetch<SessionRecordingRecord>(
    `/classrooms/${classroomId}/sessions/${sessionId}/recordings/${recordingId}`,
    {
      method: "DELETE",
    },
  );
}

export async function heartbeatMySession(
  classroomId: string,
  sessionId: string,
  status: "active" | "left" | "in_lab" = "active",
  labType?: string | null,
): Promise<SessionPresenceSummary> {
  return apiFetch<SessionPresenceSummary>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/presence`,
    {
      method: "POST",
      body: { status, ...(labType != null ? { lab_type: labType } : {}) },
    },
  );
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  classroom_id: string;
  student_id: string;
  tenant_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export async function calculateSessionAttendance(
  classroomId: string,
  sessionId: string,
): Promise<AttendanceRecord[]> {
  return apiFetch<AttendanceRecord[]>(
    `/classrooms/${classroomId}/sessions/${sessionId}/attendance/calculate`,
    { method: "POST" },
  );
}

export async function getSessionAttendance(
  classroomId: string,
  sessionId: string,
): Promise<AttendanceRecord[]> {
  return apiFetch<AttendanceRecord[]>(
    `/classrooms/${classroomId}/attendance?session_id=${sessionId}`,
  );
}

export function leaveClassroomSessionKeepalive(
  classroomId: string,
  sessionId: string,
): void {
  const token = getAccessToken();
  if (!token) return;
  const tenantId = localStorage.getItem("tenant_id");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (tenantId) headers["X-Tenant-ID"] = tenantId;

  void fetch(`/api/v1/classrooms/${classroomId}/sessions/${sessionId}/presence`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "left" }),
    keepalive: true,
  }).catch(() => {});
}

export async function getClassroomSessionParticipants(
  classroomId: string,
  sessionId: string,
): Promise<SessionPresenceParticipant[]> {
  return apiFetch<SessionPresenceParticipant[]>(
    `/classrooms/${classroomId}/sessions/${sessionId}/presence/participants`,
  );
}

export async function getMySessionParticipants(
  classroomId: string,
  sessionId: string,
): Promise<SessionPresenceParticipant[]> {
  return apiFetch<SessionPresenceParticipant[]>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/presence/participants`,
  );
}

export async function endClassroomSession(
  classroomId: string,
  sessionId: string,
  forceEndForAll = false,
): Promise<ClassroomSessionRecord> {
  return apiFetch<ClassroomSessionRecord>(`/classrooms/${classroomId}/sessions/${sessionId}/end`, {
    method: "POST",
    body: { force_end_for_all: forceEndForAll },
  });
}

export async function deleteClassroom(classroomId: string): Promise<void> {
  return apiFetch<void>(`/classrooms/${classroomId}`, { method: "DELETE" });
}

export type UpdateClassroomPayload = Partial<{
  name: string;
  program_id: string | null;
  curriculum_id: string | null;
  instructor_id: string | null;
  mode: "online" | "in-person" | "hybrid";
  recurrence_type: string | null;
  meeting_provider: string | null;
  meeting_link: string | null;
  location_address: string | null;
  schedule: Record<string, unknown> | null;
  timezone: string | null;
  max_students: number | null;
  is_active: boolean;
  settings: Record<string, unknown> | null;
}>;

export async function updateClassroom(
  classroomId: string,
  payload: UpdateClassroomPayload,
): Promise<ClassroomRecord> {
  return apiFetch<ClassroomRecord>(`/classrooms/${classroomId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function updateSession(
  classroomId: string,
  sessionId: string,
  payload: {
    session_start?: string;
    session_end?: string;
    meeting_link?: string | null;
    notes?: string | null;
  },
): Promise<ClassroomSessionRecord> {
  return apiFetch<ClassroomSessionRecord>(`/classrooms/${classroomId}/sessions/${sessionId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteSession(
  classroomId: string,
  sessionId: string,
): Promise<void> {
  return apiFetch<void>(`/classrooms/${classroomId}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function updateClassroomSessionContent(
  classroomId: string,
  sessionId: string,
  payload: {
    shared_asset_ids?: string[];
    downloadable_asset_ids?: string[];
    text_assignments?: SessionTextAssignment[];
    resource_entries?: SessionResourceEntry[];
  },
): Promise<ClassroomSessionRecord> {
  return apiFetch<ClassroomSessionRecord>(`/classrooms/${classroomId}/sessions/${sessionId}/content`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listClassroomSessionEvents(
  classroomId: string,
  sessionId: string,
  params?: { event_type?: string; limit?: number },
): Promise<ClassroomSessionEventRecord[]> {
  const query = new URLSearchParams();
  if (params?.event_type) query.set("event_type", params.event_type);
  if (params?.limit != null) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<ClassroomSessionEventRecord[]>(
    `/classrooms/${classroomId}/sessions/${sessionId}/events${suffix}`,
  );
}

export async function createClassroomSessionChat(
  classroomId: string,
  sessionId: string,
  message: string,
): Promise<ClassroomSessionEventRecord> {
  return apiFetch<ClassroomSessionEventRecord>(`/classrooms/${classroomId}/sessions/${sessionId}/chat`, {
    method: "POST",
    body: { message },
  });
}

export async function createMySessionChat(
  classroomId: string,
  sessionId: string,
  message: string,
): Promise<ClassroomSessionEventRecord> {
  return apiFetch<ClassroomSessionEventRecord>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/chat`,
    {
      method: "POST",
      body: { message },
    },
  );
}

export async function createClassroomSessionActivity(
  classroomId: string,
  sessionId: string,
  payload: {
    activity_type: "points_awarded" | "high_five" | "callout";
    student_id: string;
    message?: string;
    points_delta?: number;
  },
): Promise<ClassroomSessionEventRecord> {
  return apiFetch<ClassroomSessionEventRecord>(
    `/classrooms/${classroomId}/sessions/${sessionId}/activities`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function createMySessionSubmission(
  classroomId: string,
  sessionId: string,
  payload: {
    assignment_id?: string | null;
    content: string;
    status: "draft" | "submitted";
    preview_image?: string | null;
    lab_id?: string | null;
  },
): Promise<RealtimeEventEnvelope> {
  return apiFetch<RealtimeEventEnvelope>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/submissions`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function listMySessionSubmissions(
  classroomId: string,
  sessionId: string,
  assignmentId?: string,
): Promise<SubmissionRecord[]> {
  const qs = assignmentId ? `?assignment_id=${encodeURIComponent(assignmentId)}` : "";
  return apiFetch<SubmissionRecord[]>(
    `/students/me/classrooms/${classroomId}/sessions/${sessionId}/submissions${qs}`,
  );
}

export async function submitAssignment(
  classroomId: string,
  sessionId: string,
  assignmentId: string,
  content: string,
  status: "draft" | "submitted",
  opts?: { preview_image?: string | null; lab_id?: string | null },
): Promise<RealtimeEventEnvelope> {
  return createMySessionSubmission(classroomId, sessionId, {
    assignment_id: assignmentId,
    content,
    status,
    preview_image: opts?.preview_image ?? undefined,
    lab_id: opts?.lab_id ?? undefined,
  });
}

export async function createSessionAssignmentFromTemplate(
  classroomId: string,
  sessionId: string,
  payload: {
    template_id: string;
    due_at?: string | null;
    title?: string | null;
  },
): Promise<RealtimeEventEnvelope> {
  return apiFetch<RealtimeEventEnvelope>(
    `/classrooms/${classroomId}/sessions/${sessionId}/assignments/from-template`,
    {
      method: "POST",
      body: payload,
    },
  );
}

// ── Assignments & Grading ─────────────────────────────────────────────────

export interface ClassroomAssignment {
  id: string;
  title: string;
  instructions?: string | null;
  due_at?: string | null;
  lab_id?: string | null;
  lab_launcher_id?: string | null;
  curriculum_lab_title?: string | null;
  requires_lab?: boolean;
  requires_assets?: boolean;
  allow_edit_after_submit?: boolean;
  use_rubric?: boolean;
  rubric_template_id?: string | null;
  rubric_snapshot?: unknown[] | null;
  assignment_template_id?: string | null;
  session_id: string;
  session_start: string;
  session_end: string;
  session_status: string;
  session_display_title?: string | null;
  submission_count: number;
}

/** Rubric row sent when grading; drives analytics mean_rubric_compliance. */
export type RubricCriterionPayload = {
  criterion_id: string;
  label?: string | null;
  max_points: number;
  points_awarded: number;
};

export interface SubmissionRecord {
  event_id: string;
  session_id: string;
  assignment_id?: string | null;
  student_id: string;
  student_display_name?: string | null;
  content: string;
  status: string;
  submitted_at: string;
  grade?: number | null;
  feedback?: string | null;
  graded_at?: string | null;
  rubric?: RubricCriterionPayload[] | null;
  /** Data URL image snapshot (labs); omitted on realtime payloads. */
  preview_image?: string | null;
  lab_id?: string | null;
}

export async function listClassroomAssignments(
  classroomId: string,
): Promise<ClassroomAssignment[]> {
  return apiFetch<ClassroomAssignment[]>(`/classrooms/${classroomId}/assignments`);
}

export async function listSessionSubmissions(
  classroomId: string,
  sessionId: string,
  assignmentId?: string,
): Promise<SubmissionRecord[]> {
  const qs = assignmentId ? `?assignment_id=${encodeURIComponent(assignmentId)}` : "";
  return apiFetch<SubmissionRecord[]>(
    `/classrooms/${classroomId}/sessions/${sessionId}/submissions${qs}`,
  );
}

export async function gradeSubmission(
  classroomId: string,
  sessionId: string,
  eventId: string,
  payload: {
    score: number;
    feedback?: string | null;
    assignment_id?: string | null;
    rubric?: RubricCriterionPayload[] | null;
  },
): Promise<{ event_id: string; score: number; graded_at: string }> {
  return apiFetch(
    `/classrooms/${classroomId}/sessions/${sessionId}/submissions/${eventId}/grade`,
    { method: "POST", body: payload },
  );
}

export async function listClassroomStudents(classroomId: string): Promise<ClassroomStudentRecord[]> {
  return apiFetch<ClassroomStudentRecord[]>(`/classrooms/${classroomId}/students`);
}

export async function enrollClassroomStudent(
  classroomId: string,
  studentId: string,
): Promise<ClassroomStudentRecord> {
  return apiFetch<ClassroomStudentRecord>(`/classrooms/${classroomId}/enroll`, {
    method: "POST",
    body: { student_id: studentId },
  });
}

export async function unenrollClassroomStudent(
  classroomId: string,
  studentId: string,
): Promise<void> {
  return apiFetch<void>(`/classrooms/${classroomId}/students/${studentId}`, {
    method: "DELETE",
  });
}

export async function listClassroomRoster(
  classroomId: string,
): Promise<ClassroomRosterStudentRecord[]> {
  return apiFetch<ClassroomRosterStudentRecord[]>(`/classrooms/${classroomId}/roster`);
}

export async function regenerateClassroomMeeting(
  classroomId: string,
  provider: "zoom" | "meet" | "teams",
): Promise<{ meeting_link?: string | null }> {
  return apiFetch(`/classrooms/${classroomId}/regenerate-meeting`, {
    method: "POST",
    body: { provider },
  });
}

type RealtimeInboundMessage =
  | { type: "snapshot"; data: RealtimeSnapshot }
  | { type: "event"; data: RealtimeEventEnvelope | { event_type: string; payload?: Record<string, unknown> } }
  | { type: "replay"; data: RealtimeEventEnvelope[] }
  | { type: "ack"; data?: Record<string, unknown> }
  | { type: "error"; error?: string; details?: unknown }
  | { type: "ping"; ts?: string }
  | { type: "pong" };

export interface ClassroomRealtimeClientOptions {
  classroomId: string;
  sessionId: string;
  tenantId: string;
  token?: string | null;
  initialSequence?: number;
  heartbeatMs?: number;
  reconnectMaxDelayMs?: number;
  /**
   * When true, the server will not reset the participant's in_lab presence
   * status on connect or heartbeat. Use this when connecting from inside a
   * virtual lab (LabAssistantPanel) so the student stays visible as in_lab.
   */
  preserveInLab?: boolean;
  /**
   * Parent child mode: same learner as `X-Child-Context` on HTTP. Presence and
   * student-originated realtime commands use this student id.
   */
  childContextStudentId?: string | null;
  onSnapshot?: (snapshot: RealtimeSnapshot) => void;
  onEvent?: (event: RealtimeEventEnvelope) => void;
  onReplay?: (events: RealtimeEventEnvelope[]) => void;
  onAck?: (data: Record<string, unknown> | undefined) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

function buildWsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

function randomCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ClassroomRealtimeClient {
  private readonly opts: ClassroomRealtimeClientOptions;
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastSequence: number;
  private readonly heartbeatMs: number;
  private readonly reconnectMaxDelayMs: number;

  constructor(options: ClassroomRealtimeClientOptions) {
    this.opts = options;
    this.lastSequence = options.initialSequence ?? 0;
    this.heartbeatMs = Math.max(10_000, options.heartbeatMs ?? 20_000);
    this.reconnectMaxDelayMs = Math.max(3_000, options.reconnectMaxDelayMs ?? 30_000);
  }

  connect() {
    this.stopped = false;
    void this.openSocket();
  }

  disconnect() {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
        ws.close();
      }
    }
    this.ws = null;
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  send(
    type: string,
    payload: Record<string, unknown> = {},
    correlationId: string = randomCorrelationId(),
  ): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(
      JSON.stringify({
        type,
        correlation_id: correlationId,
        ...payload,
      }),
    );
    return true;
  }

  private async openSocket() {
    if (!this.opts.token) {
      const refreshed = await ensureFreshAccessToken(45);
      if (!refreshed) {
        this.opts.onError?.("Session expired. Please log in again.");
        return;
      }
    }
    const token = getAccessToken() ?? this.opts.token;
    if (!token) {
      this.opts.onError?.("Missing access token for realtime connection.");
      return;
    }
    const params = new URLSearchParams({
      token,
      tenant_id: this.opts.tenantId,
      last_sequence: String(this.lastSequence),
    });
    if (this.opts.preserveInLab) {
      params.set("preserve_in_lab", "1");
    }
    const childId = this.opts.childContextStudentId?.trim();
    if (childId) {
      params.set("student_actor_id", childId);
    }
    const calTz = browserCalendarTimeZone();
    if (calTz) {
      params.set("calendar_tz", calTz);
    }
    const url = buildWsUrl(
      `/api/v1/classrooms/${this.opts.classroomId}/sessions/${this.opts.sessionId}/ws?${params.toString()}`,
    );
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.opts.onConnected?.();
      this.startHeartbeat();
    };
    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.opts.onDisconnected?.();
      if (!this.stopped) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      if (!this.stopped) {
        this.opts.onError?.("Realtime connection error.");
      }
    };
    this.ws.onmessage = (evt) => {
      this.handleMessage(evt.data);
    };
  }

  private handleMessage(raw: string) {
    let parsed: RealtimeInboundMessage;
    try {
      parsed = JSON.parse(raw) as RealtimeInboundMessage;
    } catch {
      this.opts.onError?.("Received invalid realtime payload.");
      return;
    }
    if (parsed.type === "snapshot") {
      this.lastSequence = Math.max(this.lastSequence, parsed.data.latest_sequence ?? 0);
      for (const event of parsed.data.events ?? []) {
        this.lastSequence = Math.max(this.lastSequence, event.sequence ?? 0);
      }
      this.opts.onSnapshot?.(parsed.data);
      return;
    }
    if (parsed.type === "event") {
      const data = parsed.data as RealtimeEventEnvelope;
      if (typeof data.sequence === "number") {
        this.lastSequence = Math.max(this.lastSequence, data.sequence);
      }
      this.opts.onEvent?.(data);
      return;
    }
    if (parsed.type === "replay") {
      for (const event of parsed.data ?? []) {
        this.lastSequence = Math.max(this.lastSequence, event.sequence ?? 0);
      }
      this.opts.onReplay?.(parsed.data ?? []);
      return;
    }
    if (parsed.type === "ack") {
      this.opts.onAck?.(parsed.data);
      return;
    }
    if (parsed.type === "error") {
      this.opts.onError?.(parsed.error ?? "Realtime error.");
      return;
    }
    if (parsed.type === "ping") {
      this.send("pong", {}, randomCorrelationId());
      return;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send("presence.heartbeat", {}, randomCorrelationId());
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const base = Math.min(this.reconnectMaxDelayMs, 1000 * 2 ** this.reconnectAttempt);
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(this.reconnectMaxDelayMs, base + jitter);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) void this.openSocket();
    }, delay);
  }
}
