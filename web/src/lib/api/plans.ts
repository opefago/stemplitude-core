import { apiFetch } from "./client";

export interface PlanLimit {
  id: string;
  plan_id: string;
  limit_key: string;
  limit_value: number;
}

export interface PlanRecord {
  id: string;
  name: string;
  slug: string;
  type: string;
  price_monthly?: number | null;
  price_yearly?: number | null;
  trial_days: number;
  is_active: boolean;
  limits: PlanLimit[];
}

export async function listPlans(): Promise<PlanRecord[]> {
  return apiFetch<PlanRecord[]>("/plans");
}

