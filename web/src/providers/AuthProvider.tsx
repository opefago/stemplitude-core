import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  setTokens,
  clearTokens,
  decodeToken,
  isTokenExpired,
  isImpersonating as checkImpersonating,
  getImpersonatedTenant,
  endImpersonation as clearImpersonation,
  type ImpersonatedTenant,
} from "../lib/tokens";
import {
  login as apiLogin,
  studentLogin as apiStudentLogin,
  onboard as apiOnboard,
  getMe as apiGetMe,
  type MeResponse,
  type StudentLoginData,
  type OnboardData,
} from "../lib/api/auth";
import { ensureFreshAccessToken } from "../lib/api/client";

export type UserIdentity = {
  id: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: string;
  isSuperAdmin: boolean;
  globalRole?: string;
  globalPermissions: string[];
  subType: "user" | "student";
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  resolvedUIMode?: string;
  uiModeSource?: string;
};

interface AuthContextValue {
  user: UserIdentity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: string | null;
  isSuperAdmin: boolean;
  globalRole: string | null;
  globalPermissions: string[];
  hasGlobalPermission: (permission: string) => boolean;
  subType: "user" | "student" | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  studentLogin: (data: StudentLoginData) => Promise<void>;
  onboard: (data: OnboardData) => Promise<void>;
  logout: () => void;
  isImpersonating: boolean;
  impersonatedTenant: ImpersonatedTenant | null;
  endImpersonation: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeWorkspaceRoleSlug(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

function workspaceRoleForContext(u: UserIdentity | null): string | null {
  if (!u || u.subType === "student") return null;
  const r = normalizeWorkspaceRoleSlug(u.role);
  return r || null;
}

function mergeMeIntoIdentity(identity: UserIdentity, me: MeResponse): void {
  if (me.email) identity.email = me.email;
  if (me.first_name != null) identity.firstName = me.first_name;
  if (me.last_name != null) identity.lastName = me.last_name;
  if (me.is_super_admin != null) identity.isSuperAdmin = me.is_super_admin;
  if (me.global_role) identity.globalRole = me.global_role;
  if (me.global_permissions?.length) identity.globalPermissions = me.global_permissions;
  if (me.tenant_id) identity.tenantId = me.tenant_id;
  if (me.tenant_slug) identity.tenantSlug = me.tenant_slug;
  if (me.tenant_name) identity.tenantName = me.tenant_name;
  if (me.resolved_ui_mode) identity.resolvedUIMode = me.resolved_ui_mode;
  if (me.ui_mode_source) identity.uiModeSource = me.ui_mode_source;
  if (me.sub_type === "user" && me.role != null && String(me.role).trim() !== "") {
    identity.role = normalizeWorkspaceRoleSlug(me.role);
  }
}

function payloadToIdentity(payload: ReturnType<typeof decodeToken>): UserIdentity | null {
  if (!payload) return null;
  const subType = payload.sub_type === "student" ? "student" : "user";
  return {
    id: payload.sub,
    email: payload.email,
    firstName: payload.first_name ?? "",
    lastName: payload.last_name ?? "",
    role:
      subType === "student" ? "" : normalizeWorkspaceRoleSlug(payload.role),
    isSuperAdmin: payload.is_super_admin ?? false,
    globalRole: payload.global_role,
    globalPermissions: payload.global_permissions ?? [],
    subType,
    tenantId: payload.tenant_id ?? undefined,
    tenantSlug: payload.tenant_slug,
    tenantName: payload.tenant_name,
  };
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    const payload = decodeToken(token);
    const identity = payloadToIdentity(payload);
    if (!identity) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    apiGetMe()
      .then((me) => {
        mergeMeIntoIdentity(identity, me);
        setUser(identity);
      })
      .catch(() => {
        setUser(identity);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const tryRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void ensureFreshAccessToken(120);
    };
    tryRefresh();
    timer = window.setInterval(tryRefresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string) => {
      const res = await apiLogin(email, password, tenantSlug);
      const token = res.access_token;
      const payload = decodeToken(token);
      const identity = res.user
        ? {
            id: res.user.id,
            email: res.user.email,
            firstName: res.user.first_name,
            lastName: res.user.last_name,
            role: normalizeWorkspaceRoleSlug(res.user.role),
            isSuperAdmin: res.user.is_super_admin ?? payload?.is_super_admin ?? false,
            globalRole: payload?.global_role,
            globalPermissions: payload?.global_permissions ?? [],
            subType: res.user.sub_type,
            tenantId: res.user.tenant_id,
            tenantSlug: res.user.tenant_slug,
            tenantName: res.user.tenant_name,
          }
        : payloadToIdentity(payload);
      try {
        const me = await apiGetMe();
        if (identity) mergeMeIntoIdentity(identity, me);
      } catch { /* role from JWT is sufficient */ }
      setUser(identity);
    },
    [],
  );

  const studentLogin = useCallback(async (data: StudentLoginData) => {
    const res = await apiStudentLogin(data);
    const token = res.access_token;
    const payload = decodeToken(token);
    const identity = res.user
      ? {
          id: res.user.id,
          email: res.user.email,
          firstName: res.user.first_name,
          lastName: res.user.last_name,
          role: normalizeWorkspaceRoleSlug(res.user.role),
          isSuperAdmin: false,
          globalPermissions: [] as string[],
          subType: res.user.sub_type,
          tenantId: res.user.tenant_id,
          tenantSlug: res.user.tenant_slug,
          tenantName: res.user.tenant_name,
        }
      : payloadToIdentity(payload);
    try {
      const me = await apiGetMe();
      if (identity) mergeMeIntoIdentity(identity, me);
    } catch { /* fallback without mode */ }
    setUser(identity);
  }, []);

  const onboard = useCallback(async (data: OnboardData) => {
    const res = await apiOnboard(data);
    const token = res.access_token;
    const payload = decodeToken(token);
    const identity = res.user
      ? {
          id: res.user.id,
          email: res.user.email,
          firstName: res.user.first_name,
          lastName: res.user.last_name,
          role: normalizeWorkspaceRoleSlug(res.user.role),
          isSuperAdmin: false,
          globalPermissions: [] as string[],
          subType: res.user.sub_type,
          tenantId: res.user.tenant_id,
          tenantSlug: res.user.tenant_slug,
          tenantName: res.user.tenant_name,
        }
      : payloadToIdentity(payload);
    try {
      const me = await apiGetMe();
      if (identity) mergeMeIntoIdentity(identity, me);
    } catch {
      /* profile optional right after onboard */
    }
    setUser(identity);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = getAccessToken()?.trim();
    if (!token || isTokenExpired(token)) return;
    try {
      const me = await apiGetMe();
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        mergeMeIntoIdentity(next, me);
        return next;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const impersonating = checkImpersonating();
  const impersonatedTenant = impersonating ? getImpersonatedTenant() : null;

  const endImpersonation = useCallback(() => {
    clearImpersonation();
    window.location.href = "/app/dashboard";
  }, []);

  const globalPermissions = user?.globalPermissions ?? [];

  const hasGlobalPermission = useCallback(
    (permission: string): boolean => {
      if (!globalPermissions.length) return false;
      const [resource] = permission.split(":");
      return (
        globalPermissions.includes(permission) ||
        globalPermissions.includes(`${resource}:*`)
      );
    },
    [globalPermissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      role: workspaceRoleForContext(user),
      isSuperAdmin: user?.isSuperAdmin ?? false,
      globalRole: user?.globalRole ?? null,
      globalPermissions,
      hasGlobalPermission,
      subType: user?.subType ?? null,
      login,
      studentLogin,
      onboard,
      logout,
      refreshProfile,
      isImpersonating: impersonating,
      impersonatedTenant,
      endImpersonation,
    }),
    [user, isLoading, globalPermissions, hasGlobalPermission, login, studentLogin, onboard, logout, refreshProfile, impersonating, impersonatedTenant, endImpersonation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
