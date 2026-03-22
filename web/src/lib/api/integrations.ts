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
