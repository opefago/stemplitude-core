const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export interface TokenPayload {
  sub: string;
  sub_type: string;
  tenant_id: string | null;
  tenant_slug?: string;
  tenant_name?: string;
  role: string;
  is_super_admin?: boolean;
  global_role?: string;
  global_permissions?: string[];
  exp: number;
  jti: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return atob(padded);
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return {
      sub: payload.sub ?? "",
      sub_type: payload.sub_type ?? "",
      tenant_id: payload.tenant_id ?? null,
      tenant_slug: payload.tenant_slug,
      tenant_name: payload.tenant_name,
      role: payload.role ?? "",
      is_super_admin: payload.is_super_admin ?? false,
      global_role: payload.global_role,
      global_permissions: payload.global_permissions ?? [],
      exp: payload.exp ?? 0,
      jti: payload.jti ?? "",
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
    };
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return true;
  return Date.now() / 1000 >= payload.exp;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── Impersonation token management ─────────────────────────────────────────
// Swaps the main tokens with impersonation tokens, preserving originals.

const IMP_ORIGINAL_ACCESS = "imp_original_access";
const IMP_ORIGINAL_REFRESH = "imp_original_refresh";
const IMP_TENANT_KEY = "imp_tenant";

export interface ImpersonatedTenant {
  id: string;
  name: string;
  slug: string;
}

export function startImpersonation(
  accessToken: string,
  refreshToken: string,
  tenant: ImpersonatedTenant
): void {
  const currentAccess = getAccessToken();
  const currentRefresh = getRefreshToken();
  if (currentAccess) localStorage.setItem(IMP_ORIGINAL_ACCESS, currentAccess);
  if (currentRefresh) localStorage.setItem(IMP_ORIGINAL_REFRESH, currentRefresh);
  setTokens(accessToken, refreshToken);
  localStorage.setItem(IMP_TENANT_KEY, JSON.stringify(tenant));
}

export function isImpersonating(): boolean {
  return !!localStorage.getItem(IMP_TENANT_KEY);
}

export function getImpersonatedTenant(): ImpersonatedTenant | null {
  const raw = localStorage.getItem(IMP_TENANT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function endImpersonation(): void {
  const originalAccess = localStorage.getItem(IMP_ORIGINAL_ACCESS);
  const originalRefresh = localStorage.getItem(IMP_ORIGINAL_REFRESH);
  if (originalAccess && originalRefresh) {
    setTokens(originalAccess, originalRefresh);
  } else {
    clearTokens();
  }
  localStorage.removeItem(IMP_TENANT_KEY);
  localStorage.removeItem(IMP_ORIGINAL_ACCESS);
  localStorage.removeItem(IMP_ORIGINAL_REFRESH);
}
