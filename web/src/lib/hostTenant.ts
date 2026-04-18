import { getPublicTenantByHostLabel, getPublicTenantByDomain, type PublicTenantInfo } from "./api/tenants";

/** Apex domain for tenant subdomains (e.g. `localhost` or `stemplitude.com`). */
export function publicHostBaseDomain(): string {
  const raw = import.meta.env.VITE_PUBLIC_HOST_BASE_DOMAIN as string | undefined;
  return (raw || "").trim().toLowerCase().replace(/^\./, "");
}

/**
 * If the SPA is opened on ``{label}.{base}``, returns ``label`` for public tenant lookup.
 * Returns null on apex, www, or when env base is unset.
 */
export function hostSubdomainLabel(): string | null {
  const base = publicHostBaseDomain();
  if (!base || typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === base || host === `www.${base}`) return null;
  if (!host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -(base.length + 1));
  if (!label || label.includes(".")) return null;
  return label;
}

/**
 * If the browser hostname is a custom domain (not the platform apex or a subdomain of it),
 * returns the full hostname for custom-domain tenant lookup.
 */
export function hostCustomDomain(): string | null {
  const base = publicHostBaseDomain();
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!base) return host !== "localhost" ? host : null;
  if (host === base || host === `www.${base}`) return null;
  if (host.endsWith(`.${base}`)) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

/**
 * Resolve the tenant for the current browser hostname.
 * Tries subdomain label first, then falls back to custom domain lookup.
 */
export async function resolveTenantFromHost(): Promise<PublicTenantInfo | null> {
  const label = hostSubdomainLabel();
  if (label) {
    try {
      return await getPublicTenantByHostLabel(label);
    } catch {
      return null;
    }
  }

  const domain = hostCustomDomain();
  if (domain) {
    try {
      return await getPublicTenantByDomain(domain);
    } catch {
      return null;
    }
  }

  return null;
}
