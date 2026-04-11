import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAccessToken, decodeToken, isTokenExpired } from "../lib/tokens";
import { getTenantById } from "../lib/api/tenants";
import { useAuth } from "./AuthProvider";

const TENANT_KEY = "tenant_id";

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  code: string;
  type: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
  publicHostSubdomain?: string;
  customDomain?: string;
};

interface TenantContextValue {
  tenant: TenantInfo | null;
  setTenant: (t: TenantInfo) => void;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
}

function humanizeSlug(slug?: string): string {
  if (!slug) return "";
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TenantProvider({ children }: TenantProviderProps) {
  const { user } = useAuth();
  const [tenant, setTenantState] = useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setTenant = useCallback((t: TenantInfo) => {
    localStorage.setItem(TENANT_KEY, t.id);
    setTenantState(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    const tokenPayload = token && !isTokenExpired(token) ? decodeToken(token) : null;
    const tenantId =
      user?.tenantId ??
      tokenPayload?.tenant_id ??
      localStorage.getItem(TENANT_KEY);

    if (!tenantId) {
      setTenantState(null);
      localStorage.removeItem(TENANT_KEY);
      setIsLoading(false);
      return;
    }

    // Avoid calling /tenants/:id with no session (stale tenant_id in localStorage → noisy 401).
    if (!token) {
      setTenantState(null);
      localStorage.removeItem(TENANT_KEY);
      setIsLoading(false);
      return;
    }

    // Student tokens often cannot call tenant detail endpoints; use token data only.
    // We must also check token payload for first-render hydration, before `user` is set.
    if (user?.subType === "student" || tokenPayload?.sub_type === "student") {
      const tenantSlug = user?.tenantSlug ?? tokenPayload?.tenant_slug ?? "";
      const tenantName =
        user?.tenantName
        || tokenPayload?.tenant_name
        || tenantSlug
        || humanizeSlug(tenantSlug)
        || (tenantId ? `Tenant ${tenantId.slice(0, 8)}` : "Tenant");
      localStorage.setItem(TENANT_KEY, tenantId);
      setTenantState({
        id: tenantId,
        name: tenantName,
        slug: tenantSlug,
        code: "",
        type: "school",
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getTenantById(tenantId)
      .then((t) => {
        if (!cancelled) {
          localStorage.setItem(TENANT_KEY, t.id);
          setTenantState({
            id: t.id,
            name: t.name,
            slug: t.slug,
            code: t.code,
            type: t.type,
            logoUrl: t.logoUrl,
            settings: t.settings,
            publicHostSubdomain: t.publicHostSubdomain,
            customDomain: t.customDomain,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setTenantState(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.subType, user?.tenantId, user?.tenantSlug]);

  const value = useMemo<TenantContextValue>(
    () => ({ tenant, setTenant, isLoading }),
    [tenant, setTenant, isLoading],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
