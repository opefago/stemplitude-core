import { apiFetch } from "./client";

export interface FlagCheckResponse {
  flags: Record<string, boolean>;
}

export async function checkFeatureFlags(
  keys: string[],
): Promise<Record<string, boolean>> {
  if (keys.length === 0) return {};
  const resp = await apiFetch<FlagCheckResponse>(
    `/flags/check?keys=${keys.map(encodeURIComponent).join(",")}`,
  );
  return resp.flags;
}
