import { apiFetch } from "./client";

export interface ProgressSummary {
  student_id?: string;
  tenant_id?: string;
  lessons_total?: number;
  lessons_completed?: number;
  labs_total?: number;
  labs_completed?: number;
  total_lessons?: number;
  completed_lessons?: number;
  total_labs?: number;
  completed_labs?: number;
  total_time_spent_seconds?: number;
  [key: string]: unknown;
}

export async function getStudentSummary(
  studentId: string
): Promise<ProgressSummary> {
  return apiFetch<ProgressSummary>(`/progress/students/${studentId}/summary`);
}
