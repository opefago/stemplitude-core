import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  decodeToken,
} from "../tokens";
import { getChildContextStudentId } from "../childContext";

const BASE = "/api/v1";
const TENANT_KEY = "tenant_id";

/** Thrown by {@link apiFetch} for non-OK HTTP responses (after optional 401 refresh). */
export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

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

/** IANA zone for streak day boundaries; matches gamification ?calendar_tz= and WS ?calendar_tz=. */
export function browserCalendarTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim() ? tz.trim() : null;
  } catch {
    return null;
  }
}

function resolveChildContextForRequest(
  override: string | null | undefined,
): string | null {
  if (override === undefined) {
    return getChildContextStudentId()?.trim() || null;
  }
  const t = override?.trim();
  return t || null;
}

function resolveTenantId(
  explicitTenantId?: string,
  token?: string | null,
): string | null {
  if (explicitTenantId) return explicitTenantId;
  const fromStorage = localStorage.getItem(TENANT_KEY);
  if (fromStorage) return fromStorage;
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.tenant_id ?? null;
}

export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()?.trim();
  if (!refresh) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  const access = typeof data.access_token === "string" ? data.access_token.trim() : "";
  if (!access) return false;
  const nextRefresh =
    typeof data.refresh_token === "string" && data.refresh_token.trim()
      ? data.refresh_token.trim()
      : refresh;
  setTokens(access, nextRefresh);
  return true;
}

export async function ensureFreshAccessToken(minValiditySeconds = 60): Promise<boolean> {
  let access = getAccessToken()?.trim() || null;
  if (!access) {
    return refreshAccessToken();
  }
  const payload = decodeToken(access);
  if (!payload) {
    return refreshAccessToken();
  }
  const nowSec = Date.now() / 1000;
  const remainingSec = (payload.exp ?? 0) - nowSec;
  if (remainingSec > minValiditySeconds) return true;
  return refreshAccessToken();
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Plain object or array — do not pass JSON.stringify output (would double-encode). */
  body?: unknown;
  skipAuth?: boolean;
  /** Do not send ``X-Tenant-ID`` (e.g. ``POST /tenants`` before a workspace is selected). */
  skipTenantHeader?: boolean;
  /** Override tenant ID for this request (e.g. when switching tenants) */
  tenantId?: string;
  /**
   * Guardians: send this value as ``X-Child-Context`` instead of the persisted learner id.
   * Omit for default (localStorage). Pass ``null`` to omit the header on this request.
   */
  childContextOverride?: string | null;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const {
    body,
    skipAuth = false,
    skipTenantHeader = false,
    headers: optHeaders = {},
    tenantId: optTenantId,
    childContextOverride,
    ...rest
  } = options;
  const url = path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(optHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    let token = getAccessToken()?.trim() || null;
    if (!token) {
      await refreshAccessToken();
      token = getAccessToken()?.trim() || null;
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (!skipTenantHeader) {
      const tenantId = resolveTenantId(optTenantId, token);
      if (tenantId) headers["X-Tenant-ID"] = tenantId;
    }
    const childCtxResolved = resolveChildContextForRequest(childContextOverride);
    if (childCtxResolved) headers["X-Child-Context"] = childCtxResolved;
    const calTz = browserCalendarTimeZone();
    if (calTz) headers["X-Calendar-TZ"] = calTz;
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const init: RequestInit = {
    ...rest,
    headers,
    body: body !== undefined
      ? isFormData
        ? (body as FormData)
        : JSON.stringify(body)
      : undefined,
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
      if (!skipTenantHeader) {
        const tenantId = resolveTenantId(optTenantId, newToken);
        if (tenantId) {
          headers["X-Tenant-ID"] = tenantId;
        }
      } else {
        delete headers["X-Tenant-ID"];
      }
      const childCtxRetry = resolveChildContextForRequest(childContextOverride);
      if (childCtxRetry) headers["X-Child-Context"] = childCtxRetry;
      else delete headers["X-Child-Context"];
      const calTzRetry = browserCalendarTimeZone();
      if (calTzRetry) headers["X-Calendar-TZ"] = calTzRetry;
      else delete headers["X-Calendar-TZ"];
      res = await fetch(url, { ...init, headers });
    } else {
      clearTokens();
      emitApiError({ kind: "auth", message: "Your session has expired. Please log in again.", status: 401 });
      throw new ApiHttpError("Session expired", 401);
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
    throw new ApiHttpError(finalMsg, res.status);
  }

  // 204/205 and similar: no body — do not call .json() (empty body throws in browsers)
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const ct = res.headers.get("Content-Type");
  if (ct?.includes("application/json")) {
    const text = await res.text();
    if (!text.trim()) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }
  return res.text() as unknown as T;
}
