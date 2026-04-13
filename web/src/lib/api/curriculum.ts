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
  /** Classroom assignment authoring mode for curricula-linked classes. */
  classroom_assignment_source?: "curriculum" | "templates" | "create";
  /** Ordered assignment template IDs curated for this curriculum. */
  assignment_template_ids?: string[] | null;
}

export interface CourseCreatePayload {
  title: string;
  description?: string | null;
  difficulty?: string | null;
  sort_order?: number;
  is_published?: boolean;
  program_id?: string | null;
  default_permitted_labs?: string[] | null;
  classroom_assignment_source?: "curriculum" | "templates" | "create";
  assignment_template_ids?: string[] | null;
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
  classroom_assignment_source?: "curriculum" | "templates" | "create" | null;
  assignment_template_ids?: string[] | null;
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

// --- Modules & lessons (course structure) ---

export interface CurriculumModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface CurriculumLesson {
  id: string;
  module_id: string;
  title: string;
  content_type: string | null;
  content: string | null;
  sort_order: number;
  duration_minutes: number | null;
}

export interface CurriculumLab {
  id: string;
  lesson_id: string | null;
  lab_type: string;
  title: string;
  config: Record<string, unknown> | null;
  starter_code: Record<string, unknown> | null;
}

export async function listModules(courseId: string): Promise<CurriculumModule[]> {
  return apiFetch<CurriculumModule[]>(`/curriculum/courses/${courseId}/modules`);
}

export async function listLessons(moduleId: string): Promise<CurriculumLesson[]> {
  return apiFetch<CurriculumLesson[]>(`/curriculum/modules/${moduleId}/lessons`);
}

export async function listLessonLabs(lessonId: string): Promise<CurriculumLab[]> {
  return apiFetch<CurriculumLab[]>(`/curriculum/lessons/${lessonId}/labs`);
}

// --- Rubric templates ---

export interface RubricCriterionDefinition {
  criterion_id: string;
  label?: string | null;
  max_points: number;
  description?: string | null;
}

export interface RubricTemplate {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  criteria: RubricCriterionDefinition[];
  created_at: string;
  updated_at: string;
}

export interface RubricTemplateCreatePayload {
  title: string;
  description?: string | null;
  criteria?: RubricCriterionDefinition[];
}

export type RubricTemplateUpdatePayload = Partial<RubricTemplateCreatePayload>;

export async function listRubricTemplates(params: { skip?: number; limit?: number } = {}): Promise<RubricTemplate[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch<RubricTemplate[]>(`/curriculum/rubric-templates${q ? `?${q}` : ""}`);
}

export async function createRubricTemplate(payload: RubricTemplateCreatePayload): Promise<RubricTemplate> {
  return apiFetch<RubricTemplate>("/curriculum/rubric-templates", {
    method: "POST",
    body: payload,
  });
}

export async function updateRubricTemplate(id: string, payload: RubricTemplateUpdatePayload): Promise<RubricTemplate> {
  return apiFetch<RubricTemplate>(`/curriculum/rubric-templates/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteRubricTemplate(id: string): Promise<void> {
  await apiFetch<void>(`/curriculum/rubric-templates/${id}`, { method: "DELETE" });
}

// --- Assignment templates ---

export interface AssignmentTemplate {
  id: string;
  tenant_id: string;
  course_id: string | null;
  lesson_id: string | null;
  title: string;
  instructions: string | null;
  lab_id: string | null;
  rubric_template_id: string | null;
  use_rubric: boolean;
  requires_lab: boolean;
  requires_assets: boolean;
  allow_edit_after_submit: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentTemplateCreatePayload {
  title: string;
  instructions?: string | null;
  course_id?: string | null;
  lesson_id?: string | null;
  lab_id?: string | null;
  rubric_template_id?: string | null;
  use_rubric?: boolean;
  requires_lab?: boolean;
  requires_assets?: boolean;
  allow_edit_after_submit?: boolean;
  sort_order?: number;
}

export type AssignmentTemplateUpdatePayload = Partial<AssignmentTemplateCreatePayload>;

export async function listAssignmentTemplates(params: {
  skip?: number;
  limit?: number;
  course_id?: string;
  lesson_id?: string;
} = {}): Promise<AssignmentTemplate[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.course_id) qs.set("course_id", params.course_id);
  if (params.lesson_id) qs.set("lesson_id", params.lesson_id);
  const q = qs.toString();
  return apiFetch<AssignmentTemplate[]>(`/curriculum/assignment-templates${q ? `?${q}` : ""}`);
}

export async function createAssignmentTemplate(
  payload: AssignmentTemplateCreatePayload,
): Promise<AssignmentTemplate> {
  return apiFetch<AssignmentTemplate>("/curriculum/assignment-templates", {
    method: "POST",
    body: payload,
  });
}

export async function updateAssignmentTemplate(
  id: string,
  payload: AssignmentTemplateUpdatePayload,
): Promise<AssignmentTemplate> {
  return apiFetch<AssignmentTemplate>(`/curriculum/assignment-templates/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAssignmentTemplate(id: string): Promise<void> {
  await apiFetch<void>(`/curriculum/assignment-templates/${id}`, { method: "DELETE" });
}
