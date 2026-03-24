import { apiFetch } from "./client";

export interface SeatUsageRecord {
  id: string;
  license_id: string;
  tenant_id: string;
  seat_type: string;
  current_count: number;
  max_count: number;
  updated_at: string;
}

export async function listSeatUsage(): Promise<SeatUsageRecord[]> {
  return apiFetch<SeatUsageRecord[]>("/licenses/seats");
}
