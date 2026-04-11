import { getPublicTenantByHostLabel } from "./api/tenants";

/** Apex domain for tenant subdomains (e.g. `stemplitude.com`). Must match backend ``PUBLIC_HOST_BASE_DOMAIN``. */
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

export async function resolveTenantFromHost() {
  const label = hostSubdomainLabel();
  if (!label) return null;
  try {
    return await getPublicTenantByHostLabel(label);
  } catch {
    return null;
  }
}
