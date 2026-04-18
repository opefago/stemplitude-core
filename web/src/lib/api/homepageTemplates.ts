import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

export interface HomepageTemplateDTO {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  gradient: string;
  sections: Array<{ type: string; content: Record<string, unknown>; visible: boolean }>;
  is_builtin: boolean;
  is_active: boolean;
}

export async function listHomepageTemplates(opts?: {
  skip?: number;
  limit?: number;
  category?: string;
  search?: string;
}): Promise<Paginated<HomepageTemplateDTO>> {
  const params = new URLSearchParams();
  if (opts?.skip != null) params.set("skip", String(opts.skip));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.category) params.set("category", opts.category);
  if (opts?.search) params.set("search", opts.search);
  const qs = params.toString();
  return apiFetch<Paginated<HomepageTemplateDTO>>(`/homepage-templates${qs ? `?${qs}` : ""}`);
}

export async function listHomepageTemplateCategories(): Promise<string[]> {
  return apiFetch<string[]>("/homepage-templates/categories");
}

export async function getHomepageTemplate(id: string): Promise<HomepageTemplateDTO> {
  return apiFetch<HomepageTemplateDTO>(`/homepage-templates/${encodeURIComponent(id)}`);
}

export async function createHomepageTemplate(
  payload: Omit<HomepageTemplateDTO, "id" | "is_builtin" | "is_active">,
): Promise<HomepageTemplateDTO> {
  return apiFetch<HomepageTemplateDTO>("/homepage-templates", {
    method: "POST",
    body: payload,
  });
}

export async function updateHomepageTemplate(
  id: string,
  payload: Partial<Pick<HomepageTemplateDTO, "name" | "category" | "description" | "gradient" | "sections" | "is_active">>,
): Promise<HomepageTemplateDTO> {
  return apiFetch<HomepageTemplateDTO>(`/homepage-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteHomepageTemplate(id: string): Promise<void> {
  await apiFetch(`/homepage-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
