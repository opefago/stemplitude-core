import { apiFetch } from "./client";

export interface NotificationRecord {
  id: string;
  user_id?: string | null;
  student_id?: string | null;
  tenant_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  action_path?: string | null;
  action_label?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  total: number;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export async function listNotifications(params: {
  skip?: number;
  limit?: number;
  is_read?: boolean;
} = {}): Promise<NotificationListResponse> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.is_read != null) qs.set("is_read", String(params.is_read));
  const query = qs.toString();
  // Trailing `/` avoids a slash redirect whose Location can be :8000 under the Vite proxy (bad for Authorization).
  const path = query ? `/notifications/?${query}` : "/notifications/";
  return apiFetch<NotificationListResponse>(path);
}

export async function getUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
  return apiFetch<NotificationUnreadCountResponse>("/notifications/unread-count");
}

export async function markNotificationRead(id: string): Promise<NotificationRecord> {
  return apiFetch<NotificationRecord>(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<{ marked_count: number }> {
  return apiFetch<{ marked_count: number }>("/notifications/mark-all-read", { method: "POST" });
}
