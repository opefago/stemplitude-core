import { apiFetch } from "./client";
import type { Paginated } from "./pagination";

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
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
  /** Present when API exposes checkout readiness (plan price ID or dev fallback). */
  stripe_checkout_monthly_ready?: boolean;
  stripe_checkout_yearly_ready?: boolean;
  trial_days: number;
  is_active: boolean;
  limits: PlanLimit[];
}

export async function listPlans(
  params?: { skip?: number; limit?: number },
): Promise<Paginated<PlanRecord>> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<Paginated<PlanRecord>>(`/plans${qs ? `?${qs}` : ""}`);
}

