import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  decodeToken,
} from "../tokens";

const BASE = "/api/v1";
const TENANT_KEY = "tenant_id";

export type ApiErrorKind = "auth" | "network" | "server";

export interface ApiErrorEvent {
  kind: ApiErrorKind;
  message: string;
  status?: number;
}

type ApiErrorListener = (event: ApiErrorEvent) => void;
const _errorListeners = new Set<ApiErrorListener>();

export function onApiError(listener: ApiErrorListener): () => void {
  _errorListeners.add(listener);
  return () => { _errorListeners.delete(listener); };
}

function emitApiError(event: ApiErrorEvent) {
  _errorListeners.forEach((fn) => fn(event));
}

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.access_token && data.refresh_token) {
    setTokens(data.access_token, data.refresh_token);
    return true;
  }
  return false;
}

export async function ensureFreshAccessToken(minValiditySeconds = 60): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  const payload = decodeToken(token);
  const nowSec = Date.now() / 1000;
  const remainingSec = (payload?.exp ?? 0) - nowSec;
  if (remainingSec > minValiditySeconds) return true;
  return refreshAccessToken();
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
  /** Override tenant ID for this request (e.g. when switching tenants) */
  tenantId?: string;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, skipAuth = false, headers: optHeaders = {}, tenantId: optTenantId, ...rest } = options;
  const url = path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(optHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const tenantId = optTenantId ?? localStorage.getItem(TENANT_KEY);
    if (tenantId) headers["X-Tenant-ID"] = tenantId;
  }

  const init: RequestInit = {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network request failed";
    emitApiError({ kind: "network", message: msg });
    throw err;
  }

  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = getAccessToken();
      if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, { ...init, headers });
    } else {
      clearTokens();
      emitApiError({ kind: "auth", message: "Your session has expired. Please log in again.", status: 401 });
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      message = json.detail ?? json.message ?? message;
    } catch {
      if (text) message = text;
    }
    const finalMsg = typeof message === "string" ? message : JSON.stringify(message);
    if (res.status >= 500) {
      emitApiError({ kind: "server", message: finalMsg, status: res.status });
    }
    throw new Error(finalMsg);
  }

  const ct = res.headers.get("Content-Type");
  if (ct?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as T;
}
