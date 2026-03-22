import { apiFetch } from "./client";

export interface ProgressSummary {
  student_id: string;
  [key: string]: unknown;
}

export async function getStudentSummary(
  studentId: string
): Promise<ProgressSummary> {
  return apiFetch<ProgressSummary>(`/progress/students/${studentId}/summary`);
}
