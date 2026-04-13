import { apiFetch } from "./client";

export interface OAuthConnection {
  id: string;
  provider: string;
  calendar_sync_enabled: boolean;
  calendar_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConnectRedirect {
  url: string;
}

export async function listOAuthConnections(): Promise<OAuthConnection[]> {
  return apiFetch<OAuthConnection[]>("/integrations/connections");
}

export async function getConnectUrl(provider: string): Promise<ConnectRedirect> {
  return apiFetch<ConnectRedirect>(`/integrations/connect/${encodeURIComponent(provider)}`);
}

export async function disconnectConnection(id: string): Promise<void> {
  await apiFetch(`/integrations/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type YouTubeVideo = {
  id: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  privacy_status?: string | null;
  duration?: string | null;
};

export async function listYouTubeVideos(params: {
  source?: "mine" | "public";
  q?: string;
  pageToken?: string;
  maxResults?: number;
} = {}) {
  const query = new URLSearchParams();
  query.set("source", params.source ?? "mine");
  if (params.q) query.set("q", params.q);
  if (params.pageToken) query.set("page_token", params.pageToken);
  if (params.maxResults != null) query.set("max_results", String(params.maxResults));
  return apiFetch<{
    items: YouTubeVideo[];
    next_page_token?: string | null;
    prev_page_token?: string | null;
  }>(`/integrations/youtube/videos?${query.toString()}`);
}
