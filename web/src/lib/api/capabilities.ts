import { apiFetch } from "./client";

export type LabLauncherItem = {
  id: string;
  allowed: boolean;
  reason?: string | null;
};

export type LabLauncherResponse = {
  labs: LabLauncherItem[];
};

export async function getLabLauncherAvailability(): Promise<LabLauncherResponse> {
  return apiFetch<LabLauncherResponse>("/capabilities/lab-launcher");
}
