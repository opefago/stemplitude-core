import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Shield,
  Settings,
  UserPlus,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { listUserTenants } from "../../lib/api/tenants";
import { getTenantById } from "../../lib/api/tenants";
import type { TenantInfo } from "../../providers/TenantProvider";
import "./tenant-switcher.css";

export function TenantSwitcher() {
  const { user, isSuperAdmin } = useAuth();
  const { tenant, setTenant } = useTenant();
  const { workspaceMode, setWorkspaceMode, isPlatformView } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = isSuperAdmin || user?.role === "admin" || user?.role === "owner";
  const showSwitcher = isAdmin;

  useEffect(() => {
    if (!open || !isAdmin) return;
    setLoading(true);
    listUserTenants()
      .then((items) =>
        setTenants(
          items.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
        ),
      )
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [open, isAdmin]);

  // Position dropdown below the trigger to avoid overlapping it
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.left,
    });
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPlatform = () => {
    setWorkspaceMode("platform");
    setOpen(false);
    navigate("/app");
  };

  const handleSelectTenant = async (t: { id: string; name: string; slug: string }) => {
    setLoading(true);
    try {
      const info = await getTenantById(t.id);
      const tenantInfo: TenantInfo = {
        id: info.id,
        name: info.name,
        slug: info.slug,
        code: info.code,
        type: info.type,
        logoUrl: info.logoUrl,
        settings: info.settings,
      };
      setTenant(tenantInfo);
      setWorkspaceMode(t.id);
      setOpen(false);
      navigate("/app");
    } catch {
      // keep dropdown open on error
    } finally {
      setLoading(false);
    }
  };

  const displayName = isPlatformView
    ? "Platform Admin"
    : tenant?.name ?? "Organization";
  const displayInitial = isPlatformView ? "P" : (tenant?.name?.charAt(0) ?? "?");

  if (!showSwitcher) return null;

  // Merge API tenants with current tenant (ensure user's tenant is always shown)
  const tenantIds = new Set(tenants.map((t) => t.id));
  const tenantsWithCurrent =
    tenant && !tenantIds.has(tenant.id)
      ? [{ id: tenant.id, name: tenant.name, slug: tenant.slug }, ...tenants]
      : tenants;

  return (
    <div className="tenant-switcher" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="tenant-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch workspace"
      >
        {tenant?.logoUrl && !isPlatformView ? (
          <img
            src={tenant.logoUrl}
            alt=""
            className="tenant-switcher__logo"
            aria-hidden
          />
        ) : (
          <div
            className={`tenant-switcher__logo tenant-switcher__logo--${isPlatformView ? "platform" : "tenant"}`}
            aria-hidden
          >
            {isPlatformView ? (
              <Shield size={18} aria-hidden />
            ) : (
              displayInitial
            )}
          </div>
        )}
        <span className="tenant-switcher__name">{displayName}</span>
        <ChevronDown
          size={14}
          className={`tenant-switcher__chevron ${open ? "tenant-switcher__chevron--open" : ""}`}
          aria-hidden
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="tenant-switcher__dropdown"
            role="listbox"
            aria-label="Workspaces"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
          {/* Current workspace - only for tenant view */}
          {!isPlatformView && (
            <>
              <div className="tenant-switcher__current">
                <div className="tenant-switcher__current-info">
                  <span className="tenant-switcher__current-name">{displayName}</span>
                  <span className="tenant-switcher__current-meta">
                    {`${tenant?.type ?? "Organization"} · Manage members & classes`}
                  </span>
                </div>
                <div className="tenant-switcher__actions">
                  <button
                    type="button"
                    className="tenant-switcher__action-btn"
                    onClick={() => {
                      setOpen(false);
                      navigate("/app/settings");
                    }}
                  >
                    <Settings size={14} aria-hidden />
                    Settings
                  </button>
                  <button
                    type="button"
                    className="tenant-switcher__action-btn"
                    onClick={() => {
                      setOpen(false);
                      navigate("/app/members");
                    }}
                  >
                    <UserPlus size={14} aria-hidden />
                    Invite members
                  </button>
                </div>
              </div>
              <div className="tenant-switcher__divider" />
            </>
          )}

          {/* Workspaces - Platform Admin + tenant list */}
          {isSuperAdmin && (
            <>
              <div className="tenant-switcher__group-label">Workspaces</div>
              <button
                type="button"
                role="option"
                aria-selected={isPlatformView}
                className={`tenant-switcher__option ${isPlatformView ? "tenant-switcher__option--active" : ""}`}
                onClick={handleSelectPlatform}
              >
                <div className="tenant-switcher__option-logo tenant-switcher__option-logo--platform">
                  <Shield size={16} aria-hidden />
                </div>
                <span className="tenant-switcher__option-name">
                  Platform Admin
                </span>
                {isPlatformView && (
                  <Check size={14} className="tenant-switcher__option-check" aria-hidden />
                )}
              </button>
            </>
          )}

          {/* Tenant list */}
          <div className="tenant-switcher__group-label">
            {isSuperAdmin ? "Your organizations" : "Organization"}
          </div>
          {loading ? (
            <div className="tenant-switcher__loading">
              <Loader2 size={18} className="tenant-switcher__spinner" aria-hidden />
              Loading...
            </div>
          ) : (
            tenantsWithCurrent.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={!isPlatformView && workspaceMode === t.id}
                className={`tenant-switcher__option ${!isPlatformView && workspaceMode === t.id ? "tenant-switcher__option--active" : ""}`}
                onClick={() => handleSelectTenant(t)}
              >
                <div className="tenant-switcher__option-logo">
                  {t.name.charAt(0)}
                </div>
                <span className="tenant-switcher__option-name">{t.name}</span>
                {!isPlatformView && workspaceMode === t.id && (
                  <Check size={14} className="tenant-switcher__option-check" aria-hidden />
                )}
              </button>
            ))
          )}

          {isSuperAdmin && (
            <>
              <div className="tenant-switcher__divider" />
              <button
                type="button"
                className="tenant-switcher__add"
                onClick={() => {
                  setOpen(false);
                  navigate("/app/settings");
                }}
              >
                <Plus size={14} aria-hidden />
                Add organization
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
