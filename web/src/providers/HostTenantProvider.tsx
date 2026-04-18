import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { resolveTenantFromHost, hostSubdomainLabel, hostCustomDomain } from "../lib/hostTenant";
import type { PublicTenantInfo, PublicTenantBranding } from "../lib/api/tenants";

interface HostTenantContextValue {
  hostTenant: PublicTenantInfo | null;
  isHostTenantLoading: boolean;
  hostBranding: PublicTenantBranding | null;
  /** True when the SPA is accessed via a tenant subdomain or custom domain. */
  isTenantHost: boolean;
}

const HostTenantContext = createContext<HostTenantContextValue>({
  hostTenant: null,
  isHostTenantLoading: false,
  hostBranding: null,
  isTenantHost: false,
});

export function useHostTenant() {
  return useContext(HostTenantContext);
}

export function HostTenantProvider({ children }: { children: React.ReactNode }) {
  const [hostTenant, setHostTenant] = useState<PublicTenantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(() => !!(hostSubdomainLabel() || hostCustomDomain()));

  useEffect(() => {
    let cancelled = false;
    const needsResolve = !!(hostSubdomainLabel() || hostCustomDomain());
    if (!needsResolve) {
      setIsLoading(false);
      return;
    }

    resolveTenantFromHost().then((tenant) => {
      if (cancelled) return;
      setHostTenant(tenant);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hostTenant?.branding) {
      document.documentElement.style.removeProperty("--tenant-primary");
      document.documentElement.style.removeProperty("--tenant-accent");
      return;
    }
    const { primary_color, accent_color } = hostTenant.branding;
    if (primary_color) {
      document.documentElement.style.setProperty("--tenant-primary", primary_color);
    } else {
      document.documentElement.style.removeProperty("--tenant-primary");
    }
    if (accent_color) {
      document.documentElement.style.setProperty("--tenant-accent", accent_color);
    } else {
      document.documentElement.style.removeProperty("--tenant-accent");
    }
  }, [hostTenant?.branding]);

  const value = useMemo<HostTenantContextValue>(
    () => ({
      hostTenant,
      isHostTenantLoading: isLoading,
      hostBranding: hostTenant?.branding ?? null,
      isTenantHost: !!(hostSubdomainLabel() || hostCustomDomain()),
    }),
    [hostTenant, isLoading],
  );

  return (
    <HostTenantContext.Provider value={value}>{children}</HostTenantContext.Provider>
  );
}
