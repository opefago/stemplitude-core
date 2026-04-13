import { apiFetch } from "./client";

export type LessonPayload = {
  title: string;
  summary?: string;
  objectives?: string[];
  subject?: string;
  grade?: string;
  tags?: string[];
  duration_minutes?: number;
  visibility?: string;
  status?: string;
  video?: {
    provider: "youtube" | "r2";
    provider_ref: string;
    title?: string;
    duration_seconds?: number;
    thumbnail_url?: string;
  } | null;
  transcript?: string;
  quiz_ids?: string[];
  resources?: Array<{
    resource_type: string;
    title: string;
    body?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type QuizPayload = {
  title: string;
  description?: string;
  instructions?: string;
  visibility?: string;
  status?: string;
  schema_json?: Record<string, unknown>;
};

export type QuizSummary = {
  id: string;
  tenant_id?: string | null;
  owner_type: string;
  visibility: string;
  status: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  schema_json?: Record<string, unknown>;
};

export type QuizVersion = {
  id: string;
  quiz_id: string;
  version: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  status: string;
  schema_json?: Record<string, unknown>;
  created_at: string;
};

export type TrackPayload = {
  title: string;
  summary?: string;
  subject?: string;
  grade?: string;
  tags?: string[];
  visibility?: string;
  status?: string;
  lessons?: Array<{ lesson_id: string; order_index: number }>;
  milestones?: Array<{
    title: string;
    description?: string;
    order_index?: number;
    rules?: Array<{
      rule_type: string;
      threshold?: number;
      lesson_id?: string;
      config?: Record<string, unknown>;
    }>;
  }>;
};

export async function listTenantLessons(includeStemplitude = true) {
  return apiFetch<any[]>(`/tenant/lessons?include_stemplitude=${includeStemplitude ? "true" : "false"}`);
}

export async function createTenantLesson(payload: LessonPayload) {
  return apiFetch<any>("/tenant/lessons", { method: "POST", body: payload });
}

export async function listTenantQuizzes(includeStemplitude = true) {
  return apiFetch<QuizSummary[]>(`/tenant/quizzes?include_stemplitude=${includeStemplitude ? "true" : "false"}`);
}

export async function createTenantQuiz(payload: QuizPayload) {
  return apiFetch<QuizSummary>("/tenant/quizzes", { method: "POST", body: payload });
}

export async function updateTenantQuiz(quizId: string, payload: QuizPayload) {
  return apiFetch<QuizSummary>(`/tenant/quizzes/${quizId}`, { method: "PUT", body: payload });
}

export async function listTenantQuizVersions(quizId: string) {
  return apiFetch<QuizVersion[]>(`/tenant/quizzes/${quizId}/versions`);
}

export async function listTenantTracks(includeStemplitude = true) {
  return apiFetch<any[]>(`/tenant/tracks?include_stemplitude=${includeStemplitude ? "true" : "false"}`);
}

export async function createTenantTrack(payload: TrackPayload) {
  return apiFetch<any>("/tenant/tracks", { method: "POST", body: payload });
}

export async function createAdminLesson(payload: LessonPayload) {
  return apiFetch<any>("/admin/lessons", { method: "POST", body: payload });
}

export async function listAdminQuizzes() {
  return apiFetch<QuizSummary[]>("/admin/quizzes");
}

export async function createAdminQuiz(payload: QuizPayload) {
  return apiFetch<QuizSummary>("/admin/quizzes", { method: "POST", body: payload });
}

export async function updateAdminQuiz(quizId: string, payload: QuizPayload) {
  return apiFetch<QuizSummary>(`/admin/quizzes/${quizId}`, { method: "PUT", body: payload });
}

export async function listAdminQuizVersions(quizId: string) {
  return apiFetch<QuizVersion[]>(`/admin/quizzes/${quizId}/versions`);
}

export async function createAdminTrack(payload: TrackPayload) {
  return apiFetch<any>("/admin/tracks", { method: "POST", body: payload });
}

export async function duplicateContent(contentType: "lesson" | "track", contentId: string) {
  return apiFetch("/tenant/content/duplicate", {
    method: "POST",
    body: { content_type: contentType, content_id: contentId },
  });
}

export async function assignTrackToClassroom(classroomId: string, trackId: string) {
  return apiFetch(`/tenant/classrooms/${classroomId}/track-assignments`, {
    method: "POST",
    body: { track_id: trackId },
  });
}

export async function assignTrackToCurriculum(curriculumId: string, trackId: string) {
  return apiFetch(`/tenant/curriculums/${curriculumId}/track-assignments`, {
    method: "POST",
    body: { track_id: trackId },
  });
}

export async function assignLessonToClassroom(classroomId: string, lessonId: string) {
  return apiFetch(`/tenant/classrooms/${classroomId}/lesson-assignments`, {
    method: "POST",
    body: { lesson_id: lessonId },
  });
}

export async function getSuggestedLesson(classroomId: string, sessionId: string) {
  return apiFetch<any>(`/classrooms/${classroomId}/sessions/${sessionId}/suggested-lesson`);
}

export async function recordSessionCoverage(
  classroomId: string,
  sessionId: string,
  payload: {
    track_instance_id?: string;
    lesson_id?: string;
    resource_id?: string;
    selection_type?: string;
    coverage_status?: string;
    notes?: string;
  },
) {
  return apiFetch(`/classrooms/${classroomId}/sessions/${sessionId}/coverage`, {
    method: "POST",
    body: payload,
  });
}

export async function getTrackProgress(studentId: string, trackInstanceId: string) {
  const query = new URLSearchParams({ student_id: studentId, track_instance_id: trackInstanceId });
  return apiFetch<any>(`/tenant/progress/overview?${query.toString()}`);
}

export async function searchContent(q: string, visibility?: string, ownerType?: string) {
  const params = new URLSearchParams({ q });
  if (visibility) params.set("visibility", visibility);
  if (ownerType) params.set("owner_type", ownerType);
  return apiFetch<any[]>(`/search/content?${params.toString()}`);
}

export async function getPlayback(videoAssetId: string) {
  return apiFetch<any>(`/media/playback/${videoAssetId}`);
}

export async function uploadLocalMedia(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<{
    upload_id: string;
    status: string;
    storage_key: string;
    filename: string;
    size_bytes: number;
    mime_type: string;
  }>("/media/r2/upload/local", {
    method: "POST",
    body: formData,
  });
}
