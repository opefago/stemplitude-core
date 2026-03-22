import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  ChevronDown,
  Check,
  X,
  Crown,
  Wrench,
  Headphones,
} from "lucide-react";
import {
  getGlobalRoles,
  type GlobalRole,
  type RolePermissions,
} from "../../lib/api/platform";
import "./platform-roles.css";

/* -------------------------------------------------------------------------- */
/* Permission resources and actions                                           */
/* -------------------------------------------------------------------------- */

const RESOURCE_ACTIONS: Record<string, string[]> = {
  "platform.tasks": ["view", "execute", "manage"],
  "platform.health": ["view", "run"],
  "platform.analytics": ["view", "export"],
  "platform.jobs": ["view", "manage"],
  "platform.entities": ["view", "export"],
  "platform.impersonation": ["execute"],
  "platform.users": ["view", "manage"],
  "platform.tenants": ["view", "manage"],
};

/* -------------------------------------------------------------------------- */
/* Static icon and color maps                                                 */
/* -------------------------------------------------------------------------- */

const ROLE_ICON_MAP: Record<string, React.ElementType> = {
  platform_owner: Crown,
  platform_admin: Shield,
  devops: Wrench,
  support: Headphones,
};

const ROLE_COLOR_MAP: Record<string, string> = {
  platform_owner: "#ffc800",
  platform_admin: "#6c5ce7",
  devops: "#00b894",
  support: "#e17055",
};

const DEFAULT_ICON = Shield;
const DEFAULT_COLOR = "#6c5ce7";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getRoleIcon(slug: string): React.ElementType {
  return ROLE_ICON_MAP[slug] ?? DEFAULT_ICON;
}

function getRoleColor(slug: string): string {
  return ROLE_COLOR_MAP[slug] ?? DEFAULT_COLOR;
}

function countPermissions(perms: RolePermissions): number {
  return Object.values(perms).reduce(
    (sum, actions) => sum + (Array.isArray(actions) ? actions.length : 0),
    0
  );
}

function deriveDescription(slug: string, name: string): string {
  const descMap: Record<string, string> = {
    platform_owner: "Full access to all platform resources and settings",
    platform_admin: "Most access; cannot manage platform owners",
    devops: "Health checks, jobs, and background tasks",
    support: "Entities, impersonation, and analytics",
  };
  return descMap[slug] ?? name;
}

function isPermissionGranted(
  perms: RolePermissions,
  resource: string,
  action: string
): boolean {
  const actions = perms[resource];
  return Array.isArray(actions) && actions.includes(action);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PlatformRolesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<GlobalRole[]>([]);
  const [selectedRoleForDetail, setSelectedRoleForDetail] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rolesRes = await getGlobalRoles();
      setRoles(rolesRes.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleRoleDetail = (slug: string) => {
    setSelectedRoleForDetail((prev) => (prev === slug ? null : slug));
  };

  if (loading) {
    return (
      <div className="prp-page">
        <div className="prp-header">
          <div className="prp-header__left">
            <Shield size={28} className="prp-header__icon" />
            <div>
              <h1 className="prp-header__title">Platform Roles</h1>
              <p className="prp-header__subtitle">Manage global roles and user assignments</p>
            </div>
          </div>
        </div>
        <section className="prp-section">
          <p className="prp-loading">Loading roles and assignments…</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="prp-page">
        <div className="prp-header">
          <div className="prp-header__left">
            <Shield size={28} className="prp-header__icon" />
            <div>
              <h1 className="prp-header__title">Platform Roles</h1>
              <p className="prp-header__subtitle">Manage global roles and user assignments</p>
            </div>
          </div>
        </div>
        <section className="prp-section">
          <div className="prp-error">
            <p>{error}</p>
            <button type="button" className="prp-btn prp-btn--primary" onClick={fetchData}>
              Retry
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="prp-page">
      <div className="prp-header">
        <div className="prp-header__left">
          <Shield size={28} className="prp-header__icon" />
          <div>
            <h1 className="prp-header__title">Platform Roles</h1>
            <p className="prp-header__subtitle">Manage global roles and user assignments</p>
          </div>
        </div>
      </div>

      {/* Roles Section */}
      <section className="prp-section">
        <h2 className="prp-section__title">System Roles</h2>
        <div className="prp-roles-grid">
          {roles.map((role) => {
            const Icon = getRoleIcon(role.slug);
            const color = getRoleColor(role.slug);
            const permCount = countPermissions(role.permissions);
            const isExpanded = selectedRoleForDetail === role.slug;
            const description = deriveDescription(role.slug, role.name);

            return (
              <div
                key={role.slug}
                className={`prp-role-card ${isExpanded ? "prp-role-card--expanded" : ""}`}
                style={{ "--role-accent": color } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="prp-role-card__main"
                  onClick={() => toggleRoleDetail(role.slug)}
                  aria-expanded={isExpanded}
                >
                  <div className="prp-role-card__icon-wrap">
                    <Icon size={24} />
                  </div>
                  <div className="prp-role-card__content">
                    <div className="prp-role-card__top">
                      <h3 className="prp-role-card__name">{role.name}</h3>
                      {role.slug === "platform_owner" && (
                        <span className="prp-role-card__badge prp-role-card__badge--full">
                          Full access
                        </span>
                      )}
                    </div>
                    <code className="prp-role-card__slug">{role.slug}</code>
                    <p className="prp-role-card__desc">{description}</p>
                    <div className="prp-role-card__meta">
                      <span className="prp-role-card__meta-item">
                        <Users size={14} />
                        {role.user_count} users
                      </span>
                      <span className="prp-role-card__meta-item">
                        {permCount} permissions
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`prp-role-card__chevron ${isExpanded ? "prp-role-card__chevron--up" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="prp-role-card__permissions">
                    <h4 className="prp-role-card__perms-title">Permissions by resource</h4>
                    <div className="prp-role-card__perms-list">
                      {Object.entries(RESOURCE_ACTIONS).map(([resource, actions]) => (
                        <div key={resource} className="prp-perm-group">
                          <div className="prp-perm-group__resource">{resource}</div>
                          <div className="prp-perm-group__actions">
                            {actions.map((action) => {
                              const granted = isPermissionGranted(
                                role.permissions,
                                resource,
                                action
                              );
                              return (
                                <div
                                  key={action}
                                  className={`prp-perm-item ${granted ? "prp-perm-item--granted" : "prp-perm-item--denied"}`}
                                >
                                  {granted ? (
                                    <Check size={14} className="prp-perm-icon prp-perm-icon--check" />
                                  ) : (
                                    <X size={14} className="prp-perm-icon prp-perm-icon--x" />
                                  )}
                                  <span>{action}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}
