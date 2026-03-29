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
import {
  listUserTenants,
  getTenantById,
  createTenant,
} from "../../lib/api/tenants";
import type { TenantInfo } from "../../providers/TenantProvider";
import { useChildContextStudentId } from "../../lib/childContext";
import { TenantInviteMembersModal } from "./TenantInviteMembersModal";
import "./tenant-switcher.css";

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function randomOrgCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export function TenantSwitcher() {
  const { user, isSuperAdmin, refreshProfile } = useAuth();
  const learnerContextStudentId = useChildContextStudentId();
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

  const [createExpanded, setCreateExpanded] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgCode, setNewOrgCode] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const isAdmin = isSuperAdmin || user?.role === "admin" || user?.role === "owner";
  const isParentLike =
    user?.role === "parent" || user?.role === "homeschool_parent";
  const isInstructor = user?.role === "instructor";
  const showSwitcher = isAdmin || isParentLike || isInstructor;
  const showInlineCreate = isParentLike && !isSuperAdmin;

  useEffect(() => {
    if (!open || !showSwitcher) return;
    setLoading(true);
    listUserTenants()
      .then((items) =>
        setTenants(
          items.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
        ),
      )
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [open, showSwitcher]);

  useEffect(() => {
    if (!open) {
      setCreateExpanded(false);
      setCreateErr(null);
    }
  }, [open]);

  useEffect(() => {
    if (!createExpanded) return;
    if (!slugTouched && newOrgName) {
      setNewOrgSlug(slugFromName(newOrgName));
    }
  }, [newOrgName, createExpanded, slugTouched]);

  useEffect(() => {
    if (createExpanded && !newOrgCode) {
      setNewOrgCode(randomOrgCode());
    }
  }, [createExpanded, newOrgCode]);

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
      await refreshProfile();
      navigate("/app");
    } catch {
      /* keep dropdown open */
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    const name = newOrgName.trim();
    const slug = newOrgSlug.trim().toLowerCase();
    const code = newOrgCode.trim().toUpperCase();
    if (name.length < 2) {
      setCreateErr("Enter an organization name.");
      return;
    }
    if (slug.length < 2) {
      setCreateErr("Enter a URL slug (letters, numbers, hyphens).");
      return;
    }
    if (code.length < 4) {
      setCreateErr("Join code must be at least 4 characters.");
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const created = await createTenant({
        name,
        slug,
        code,
        type: user?.role === "homeschool_parent" ? "parent" : "center",
      });
      const tenantInfo: TenantInfo = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        code: created.code,
        type: created.type,
        logoUrl: created.logoUrl,
        settings: created.settings,
      };
      setTenant(tenantInfo);
      setWorkspaceMode(created.id);
      setOpen(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgCode("");
      setSlugTouched(false);
      setCreateExpanded(false);
      await refreshProfile();
      navigate("/app");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not create organization.";
      setCreateErr(msg);
    } finally {
      setCreateBusy(false);
    }
  };

  const displayName = isPlatformView
    ? "Platform Admin"
    : tenant?.name ?? "Organization";
  const displayInitial = isPlatformView ? "P" : (tenant?.name?.charAt(0) ?? "?");

  if (!showSwitcher) return null;

  const tenantIds = new Set(tenants.map((t) => t.id));
  const tenantsWithCurrent =
    tenant && !tenantIds.has(tenant.id)
      ? [{ id: tenant.id, name: tenant.name, slug: tenant.slug }, ...tenants]
      : tenants;

  const listGroupLabel =
    isSuperAdmin || isParentLike || isInstructor
      ? "Your organizations"
      : "Organization";

  return (
    <div className="tenant-switcher" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="tenant-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch organization"
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

      {tenant?.id ? (
        <TenantInviteMembersModal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          tenantId={tenant.id}
          tenantName={tenant.name}
        />
      ) : null}

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className={`tenant-switcher__dropdown${createExpanded ? " tenant-switcher__dropdown--expanded" : ""}`}
            role="listbox"
            aria-label="Organizations"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
            {!isPlatformView && isAdmin && (
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
                        setInviteModalOpen(true);
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

            {!isPlatformView && (isParentLike || isInstructor) && !isAdmin && (
              <>
                <div className="tenant-switcher__current tenant-switcher__current--muted">
                  <div className="tenant-switcher__current-info">
                    <span className="tenant-switcher__current-name">{displayName}</span>
                    <span className="tenant-switcher__current-meta">
                      {isParentLike
                        ? "You can switch between organizations you belong to, or create your own."
                        : "Switch between organizations where you teach."}
                    </span>
                  </div>
                </div>
                <div className="tenant-switcher__divider" />
              </>
            )}

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

            <div className="tenant-switcher__group-label">{listGroupLabel}</div>
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

            {isParentLike && !isPlatformView && !learnerContextStudentId && (
              <>
                <div className="tenant-switcher__divider" />
                <button
                  type="button"
                  className="tenant-switcher__add"
                  onClick={() => {
                    setOpen(false);
                    navigate("/app/child");
                  }}
                >
                  <UserPlus size={14} aria-hidden />
                  View as learner
                </button>
              </>
            )}

            {showInlineCreate && (
              <>
                <div className="tenant-switcher__divider" />
                {!createExpanded ? (
                  <button
                    type="button"
                    className="tenant-switcher__add"
                    onClick={() => setCreateExpanded(true)}
                  >
                    <Plus size={14} aria-hidden />
                    Create new organization
                  </button>
                ) : (
                  <div className="tenant-switcher__create">
                    <div className="tenant-switcher__create-title">New organization</div>
                    <label className="tenant-switcher__create-label">
                      Name
                      <input
                        type="text"
                        className="tenant-switcher__create-input"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="e.g. Smith Homeschool"
                        autoComplete="organization"
                      />
                    </label>
                    <label className="tenant-switcher__create-label">
                      URL slug
                      <input
                        type="text"
                        className="tenant-switcher__create-input"
                        value={newOrgSlug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setNewOrgSlug(e.target.value);
                        }}
                        placeholder="smith-homeschool"
                        autoComplete="off"
                      />
                    </label>
                    <label className="tenant-switcher__create-label">
                      Student join code
                      <input
                        type="text"
                        className="tenant-switcher__create-input"
                        value={newOrgCode}
                        onChange={(e) => setNewOrgCode(e.target.value.toUpperCase())}
                        placeholder="ABCD12"
                        maxLength={20}
                        autoComplete="off"
                      />
                    </label>
                    {createErr ? (
                      <p className="tenant-switcher__create-error" role="alert">
                        {createErr}
                      </p>
                    ) : null}
                    <div className="tenant-switcher__create-actions">
                      <button
                        type="button"
                        className="tenant-switcher__create-cancel"
                        onClick={() => {
                          setCreateExpanded(false);
                          setCreateErr(null);
                        }}
                        disabled={createBusy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="tenant-switcher__create-submit"
                        onClick={() => void handleCreateOrganization()}
                        disabled={createBusy}
                      >
                        {createBusy ? (
                          <>
                            <Loader2 size={14} className="tenant-switcher__spinner" aria-hidden />
                            Creating…
                          </>
                        ) : (
                          "Create & switch"
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
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
