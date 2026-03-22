import { apiFetch } from "./client";

export interface Course {
  id: string;
  tenant_id?: string | null;
  program_id?: string | null;
  title: string;
  description: string | null;
  difficulty: string | null;
  sort_order: number;
  is_published: boolean;
  /** Lab launcher labels that prefill permitted labs when creating a class with this curriculum. */
  default_permitted_labs?: string[] | null;
}

export interface CourseCreatePayload {
  title: string;
  description?: string | null;
  difficulty?: string | null;
  sort_order?: number;
  is_published?: boolean;
  program_id?: string | null;
  default_permitted_labs?: string[] | null;
}

export interface CourseUpdatePayload {
  title?: string | null;
  description?: string | null;
  difficulty?: string | null;
  sort_order?: number | null;
  is_published?: boolean | null;
  program_id?: string | null;
  /** Send `[]` to clear curriculum defaults. */
  default_permitted_labs?: string[] | null;
}

export async function listCourses(params: {
  skip?: number;
  limit?: number;
  is_published?: boolean;
  program_id?: string;
} = {}): Promise<Course[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.is_published != null) qs.set("is_published", String(params.is_published));
  if (params.program_id) qs.set("program_id", params.program_id);
  const query = qs.toString();
  return apiFetch<Course[]>(`/curriculum/courses${query ? `?${query}` : ""}`);
}

export async function getCourse(id: string): Promise<Course> {
  return apiFetch<Course>(`/curriculum/courses/${id}`);
}

export async function createCourse(payload: CourseCreatePayload): Promise<Course> {
  return apiFetch<Course>("/curriculum/courses", {
    method: "POST",
    body: payload,
  });
}

export async function updateCourse(id: string, payload: CourseUpdatePayload): Promise<Course> {
  return apiFetch<Course>(`/curriculum/courses/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteCourse(id: string): Promise<void> {
  await apiFetch<void>(`/curriculum/courses/${id}`, {
    method: "DELETE",
  });
}
