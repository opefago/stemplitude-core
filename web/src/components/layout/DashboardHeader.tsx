import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  Search,
  Building2,
  Loader2,
  AlertCircle,
  Menu,
  PanelLeftClose,
  X,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useUIMode } from "../../providers/UIModeProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useSidebarOptional } from "../../contexts/SidebarContext";
import { useCommandPalette } from "../../contexts/CommandPaletteContext";
import {
  searchTenants,
  impersonateTenant,
  type TenantSearchResult,
} from "../../lib/api/platform";
import { startImpersonation } from "../../lib/tokens";
import { TenantSettings } from "../../features/settings/TenantSettings";
import { ProfilePage } from "../../features/profile";
import { NotificationBell } from "../../features/notifications";
import { AppTooltip } from "../../components/ui";
import "./dashboard-header.css";

function getInitials(
  firstName?: string,
  lastName?: string,
  email?: string,
): string {
  const first = firstName?.charAt(0) ?? "";
  const last = lastName?.charAt(0) ?? "";
  if (first || last) return (first + last).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

function getDisplayName(
  firstName?: string,
  lastName?: string,
  email?: string,
): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (name) return name;
  if (email) return email;
  return "User";
}

const PLATFORM_TOOLS: {
  path: string;
  label: string;
  iconSrc: string;
  permission: string;
}[] = [
  {
    path: "/app/platform/tasks",
    label: "Admin Tasks",
    iconSrc: "/assets/cartoon-icons/portal1.png",
    permission: "platform.tasks:view",
  },
  {
    path: "/app/platform/health",
    label: "Health Check",
    iconSrc: "/assets/cartoon-icons/Heart.png",
    permission: "platform.health:view",
  },
  {
    path: "/app/platform/jobs",
    label: "Job Worker",
    iconSrc: "/assets/cartoon-icons/gear.png",
    permission: "platform.jobs:view",
  },
  {
    path: "/app/platform/entities",
    label: "Entity Browser",
    iconSrc: "/assets/cartoon-icons/Chest.png",
    permission: "platform.entities:view",
  },
  {
    path: "/app/platform/blobs",
    label: "Blob Finder",
    iconSrc: "/assets/cartoon-icons/Chest2.png",
    permission: "platform.blobs:view",
  },
  {
    path: "/app/platform/growth",
    label: "Growth Ops",
    iconSrc: "/assets/cartoon-icons/Trail.png",
    permission: "platform.growth:view",
  },
];

interface DashboardHeaderProps {
  variant?: "default" | "platform";
}

function resolveEnvironmentLabel(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const raw =
    env.VITE_DEPLOY_ENV ??
    env.VITE_ENVIRONMENT ??
    env.VITE_APP_ENV ??
    env.VITE_STAGE ??
    env.MODE ??
    "development";
  const value = raw.trim().toLowerCase();
  if (value === "prod") return "production";
  if (value === "dev") return "development";
  return value;
}

function getEnvironmentTone(
  environmentLabel: string,
): "production" | "latest" | "development" | "default" {
  if (environmentLabel === "production") return "production";
  if (environmentLabel === "latest" || environmentLabel === "staging")
    return "latest";
  if (environmentLabel === "development" || environmentLabel === "local")
    return "development";
  return "default";
}

export function DashboardHeader({ variant = "default" }: DashboardHeaderProps) {
  const { user, logout, role, isSuperAdmin, hasGlobalPermission } = useAuth();
  const { isPlatformView } = useWorkspace();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [showImpersonate, setShowImpersonate] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const platformRef = useRef<HTMLDivElement>(null);

  // Impersonation dialog state
  const [impQuery, setImpQuery] = useState("");
  const [impResults, setImpResults] = useState<TenantSearchResult[]>([]);
  const [impSearching, setImpSearching] = useState(false);
  const [impLoading, setImpLoading] = useState(false);
  const [impError, setImpError] = useState("");
  const impSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleImpSearch = useCallback((q: string) => {
    setImpQuery(q);
    setImpError("");
    if (impSearchTimer.current) clearTimeout(impSearchTimer.current);
    if (!q.trim()) {
      setImpResults([]);
      return;
    }
    impSearchTimer.current = setTimeout(async () => {
      setImpSearching(true);
      try {
        const res = await searchTenants(q.trim());
        setImpResults(res.tenants);
      } catch {
        setImpResults([]);
      } finally {
        setImpSearching(false);
      }
    }, 300);
  }, []);

  const handleImpersonate = useCallback(async (tenant: TenantSearchResult) => {
    setImpLoading(true);
    setImpError("");
    try {
      const res = await impersonateTenant(tenant.grant_id);
      startImpersonation(res.access_token, res.refresh_token, res.tenant);
      setShowImpersonate(false);
      window.open("/app/dashboard", "_blank", "noopener");
    } catch (e: unknown) {
      setImpError(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpLoading(false);
    }
  }, []);

  const resetImpDialog = useCallback(() => {
    setShowImpersonate(false);
    setImpQuery("");
    setImpResults([]);
    setImpError("");
  }, []);

  const isOnPlatformAdminPage = location.pathname.startsWith("/app/platform/");
  const isPlatformAdminContext = isPlatformView || isOnPlatformAdminPage;
  const canAccessSettings =
    (isSuperAdmin || role === "admin" || role === "owner") &&
    !isOnPlatformAdminPage;
  const canImpersonate = hasGlobalPermission("platform.impersonation:execute");

  const platformTools = PLATFORM_TOOLS.filter(
    (t) => isSuperAdmin || hasGlobalPermission(t.permission),
  );
  const canAccessPlatform = platformTools.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (platformRef.current && !platformRef.current.contains(target)) {
        setPlatformOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { openPalette } = useCommandPalette();
  const { mode } = useUIMode();
  const sidebar = useSidebarOptional();
  const showSidebarToggle = mode !== "kids" && sidebar;
  const showHamburger = showSidebarToggle && sidebar.closed;
  const hidePaletteTrigger =
    variant === "platform" || location.pathname.startsWith("/app/platform/");
  const isAdminView = isSuperAdmin || role === "admin" || role === "owner";
  const environmentLabel = resolveEnvironmentLabel();
  const environmentTone = getEnvironmentTone(environmentLabel);

  return (
    <header className="dash-header">
      {/* Left: Hamburger when sidebar closed (Notion-style) + Search */}
      <div className="dash-header__left">
        {variant === "platform" && (
          <span
            className={`dash-header__env-pill dash-header__env-pill--${environmentTone}`}
            aria-label={`Environment ${environmentLabel}`}
          >
            {environmentLabel}
          </span>
        )}
        {showHamburger && (
          <button
            type="button"
            className="dash-header__nav-toggle"
            onClick={sidebar.openSidebar}
            aria-label="Open sidebar"
          >
            <Menu size={20} aria-hidden />
          </button>
        )}
        {!hidePaletteTrigger && (
          <button
            type="button"
            className="dash-header__search-btn"
            onClick={openPalette}
            aria-label="Search or run command (⌘K)"
          >
            <Search size={18} aria-hidden />
            <span className="dash-header__search-label">Search...</span>
            <kbd className="dash-header__search-kbd">⌘K</kbd>
          </button>
        )}
      </div>

      <div className="dash-header__spacer" />

      <div className="dash-header__actions">
        {variant === "default" && (
          <>
            <NotificationBell />
            {!isPlatformAdminContext && (
              <AppTooltip
                title="Messages"
                description="Open your inbox and class conversations."
                placement="bottom"
              >
                <Link
                  to="/app/messages"
                  className="dash-header__icon-btn dash-header__icon-btn--link"
                  aria-label="Messages"
                >
                  <img src="/assets/cartoon-icons/Papyrus.png" alt="" className="dash-header__icon-img" aria-hidden />
                </Link>
              </AppTooltip>
            )}
            <AppTooltip
              title="Help"
              description="Open help tips and quick guidance."
              placement="bottom"
            >
              <button
                type="button"
                className="dash-header__icon-btn"
                aria-label="Help"
              >
                <img src="/assets/cartoon-icons/Information.png" alt="" className="dash-header__icon-img" aria-hidden />
              </button>
            </AppTooltip>
          </>
        )}

        {/* Platform shield - only for users with sufficient permissions */}
        {canAccessPlatform && (
          <div className="dash-header__platform" ref={platformRef}>
            <AppTooltip
              title="Platform Tools"
              description="Open admin tools like tasks, jobs, and growth."
              placement="bottom"
              disabled={platformOpen}
            >
              <button
                type="button"
                className="dash-header__icon-btn dash-header__platform-trigger"
                onClick={() => setPlatformOpen((p) => !p)}
                aria-expanded={platformOpen}
                aria-haspopup="menu"
                aria-label="Platform tools"
                data-active={platformOpen || undefined}
              >
                <img src="/assets/cartoon-icons/portal1.png" alt="" className="dash-header__icon-img" aria-hidden />
              </button>
            </AppTooltip>
            {platformOpen && (
              <div className="dash-header__platform-dropdown" role="menu">
                <div className="dash-header__platform-header">
                  Platform Tools
                </div>
                {role && (
                  <span className="dash-header__platform-role">{role}</span>
                )}
                {platformTools.map((item) => {
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      className="dash-header__dropdown-item"
                      onClick={() => {
                        setPlatformOpen(false);
                        window.open(item.path, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <img src={item.iconSrc} alt="" className="dash-header__menu-icon" aria-hidden /> {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Platform variant: show identity inline */}
        {variant === "platform" && (
          <div className="dash-header__identity">
            <span className="dash-header__identity-name">
              {user
                ? getDisplayName(user.firstName, user.lastName, user.email)
                : "User"}
            </span>
            {user?.email && (
              <span className="dash-header__identity-role">{user.email}</span>
            )}
          </div>
        )}

        {/* Profile dropdown - only on default variant */}
        {variant === "default" && (
          <div className="dash-header__profile" ref={dropdownRef}>
            <button
              type="button"
              className="dash-header__avatar-btn"
              onClick={() => setDropdownOpen((p) => !p)}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <div className="dash-header__avatar">
                {user
                  ? getInitials(user.firstName, user.lastName, user.email)
                  : "?"}
              </div>
              <ChevronDown size={14} className="dash-header__caret" />
            </button>

            {dropdownOpen && (
              <div className="dash-header__dropdown" role="menu">
                <div className="dash-header__dropdown-user">
                  <div className="dash-header__dropdown-avatar">
                    {user
                      ? getInitials(user.firstName, user.lastName, user.email)
                      : "?"}
                  </div>
                  <div className="dash-header__dropdown-info">
                    <span className="dash-header__dropdown-name">
                      {user
                        ? getDisplayName(
                            user.firstName,
                            user.lastName,
                            user.email,
                          )
                        : "User"}
                    </span>
                    {user?.email && (
                      <span className="dash-header__dropdown-email">
                        {user.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="dash-header__dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dash-header__dropdown-item"
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowProfileDialog(true);
                  }}
                >
                  <img
                    src="/assets/cartoon-icons/Players.png"
                    alt=""
                    className="dash-header__menu-icon"
                    aria-hidden
                  />
                  Profile
                </button>

                {canAccessSettings && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dash-header__dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowSettingsDialog(true);
                    }}
                  >
                    <img
                      src="/assets/cartoon-icons/settings.png"
                      alt=""
                      className="dash-header__menu-icon"
                      aria-hidden
                    />
                    Settings
                  </button>
                )}

                {canImpersonate && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dash-header__dropdown-item"
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowImpersonate(true);
                    }}
                  >
                    <img
                      src="/assets/cartoon-icons/teleport.png"
                      alt=""
                      className="dash-header__menu-icon"
                      aria-hidden
                    />
                    Impersonate Tenant
                  </button>
                )}

                <div className="dash-header__dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dash-header__dropdown-item dash-header__dropdown-item--danger"
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                >
                  <img
                    src="/assets/cartoon-icons/Forbidden.png"
                    alt=""
                    className="dash-header__menu-icon"
                    aria-hidden
                  />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Impersonation Dialog */}
      {showImpersonate && (
        <div
          className="dash-header__impersonate-overlay"
          onClick={resetImpDialog}
        >
          <div
            className="dash-header__impersonate-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Impersonate Tenant</h3>
            <p>
              Use a tenant-approved support access grant. Opens in a new tab.
            </p>
            <div className="dash-header__impersonate-field">
              <label htmlFor="imp-tenant">Search tenants</label>
              <div className="dash-header__imp-search-wrap">
                <Search size={16} className="dash-header__imp-search-icon" />
                <input
                  id="imp-tenant"
                  type="text"
                  placeholder="Search by name or slug..."
                  value={impQuery}
                  onChange={(e) => handleImpSearch(e.target.value)}
                  autoFocus
                />
                {impSearching && (
                  <Loader2 size={16} className="dash-header__imp-spinner" />
                )}
              </div>
            </div>

            {impError && (
              <div className="dash-header__imp-error">
                <AlertCircle size={14} /> {impError}
              </div>
            )}

            {impResults.length > 0 && (
              <div className="dash-header__imp-results">
                {impResults.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="dash-header__imp-tenant-row"
                    disabled={impLoading}
                    onClick={() => handleImpersonate(t)}
                  >
                    <Building2
                      size={16}
                      className="dash-header__imp-tenant-icon"
                    />
                    <div className="dash-header__imp-tenant-info">
                      <span className="dash-header__imp-tenant-name">
                        {t.name}
                      </span>
                      <span className="dash-header__imp-tenant-slug">
                        {t.slug}
                        {t.role_name ? ` • ${t.role_name}` : ""}
                        {t.expires_at
                          ? ` • expires ${new Date(t.expires_at).toLocaleString()}`
                          : ""}
                      </span>
                    </div>
                    <span
                      className={`dash-header__imp-tenant-badge ${!t.is_active ? "dash-header__imp-tenant-badge--inactive" : ""}`}
                    >
                      {t.type}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {impQuery && !impSearching && impResults.length === 0 && (
              <p className="dash-header__imp-empty">No tenants found.</p>
            )}

            <div className="dash-header__impersonate-actions">
              <button
                type="button"
                className="dash-header__imp-btn dash-header__imp-btn--cancel"
                onClick={resetImpDialog}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsDialog && (
        <div
          className="dash-header__settings-overlay"
          onClick={() => setShowSettingsDialog(false)}
        >
          <div
            className="dash-header__settings-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-header__settings-head">
              <h3>Settings</h3>
              <button
                type="button"
                className="dash-header__settings-close"
                onClick={() => setShowSettingsDialog(false)}
                aria-label="Close settings dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="dash-header__settings-content">
              <TenantSettings />
            </div>
          </div>
        </div>
      )}

      {showProfileDialog && (
        <div
          className="dash-header__settings-overlay"
          onClick={() => setShowProfileDialog(false)}
        >
          <div
            className="dash-header__settings-dialog dash-header__settings-dialog--profile"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-header__settings-head">
              <h3>Profile</h3>
              <button
                type="button"
                className="dash-header__settings-close"
                onClick={() => setShowProfileDialog(false)}
                aria-label="Close profile dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="dash-header__settings-content dash-header__settings-content--profile">
              <ProfilePage />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
