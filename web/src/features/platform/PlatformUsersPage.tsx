import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  ChevronDown,
  Edit3,
  Clock,
} from "lucide-react";
import {
  getGlobalRoles,
  getRoleAssignments,
  assignRole,
  removeRole,
  type GlobalRole,
  type UserAssignment,
} from "../../lib/api/platform";
import "./platform-roles.css";

const ROLE_COLOR_MAP: Record<string, string> = {
  platform_owner: "#ffc800",
  platform_admin: "#6c5ce7",
  devops: "#00b894",
  support: "#e17055",
};

const DEFAULT_COLOR = "#6c5ce7";

function getRoleColor(slug: string): string {
  return ROLE_COLOR_MAP[slug] ?? DEFAULT_COLOR;
}

function getInitials(firstName: string, lastName: string): string {
  const parts = [firstName, lastName].filter(Boolean);
  return (
    parts
      .map((n) => (n || "").charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function formatAssignedDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? dateStr : d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

export function PlatformUsersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<GlobalRole[]>([]);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserRole, setAddUserRole] = useState("platform_admin");
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [rolesRes, assignmentsRes] = await Promise.all([
        getGlobalRoles(),
        getRoleAssignments(),
      ]);
      setRoles(rolesRes.roles);
      setAssignments(assignmentsRes.assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user assignments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = useCallback(
    async (email: string, newRoleSlug: string) => {
      setActionError(null);
      const res = await assignRole(email, newRoleSlug);
      if (res.ok) {
        setEditingUserEmail(null);
        await fetchData();
      } else {
        setActionError(res.error ?? res.message ?? "Failed to change role");
      }
    },
    [fetchData],
  );

  const handleRemoveRole = useCallback(
    async (email: string) => {
      setActionError(null);
      const res = await removeRole(email);
      if (res.ok) {
        await fetchData();
      } else {
        setActionError(res.error ?? res.message ?? "Failed to remove role");
      }
    },
    [fetchData],
  );

  const handleAddUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!addUserEmail.trim()) return;
      setAddUserError(null);
      const res = await assignRole(addUserEmail.trim(), addUserRole);
      if (res.ok) {
        setAddUserEmail("");
        setAddUserRole("platform_admin");
        setShowAddUser(false);
        await fetchData();
      } else {
        setAddUserError(res.error ?? res.message ?? "Failed to add user");
      }
    },
    [addUserEmail, addUserRole, fetchData],
  );

  if (loading) {
    return (
      <div className="prp-page">
        <div className="prp-header">
          <div className="prp-header__left">
            <Users size={28} className="prp-header__icon" />
            <div>
              <h1 className="prp-header__title">Platform Users</h1>
              <p className="prp-header__subtitle">Manage user role assignments</p>
            </div>
          </div>
        </div>
        <section className="prp-section">
          <p className="prp-loading">Loading user assignments…</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="prp-page">
        <div className="prp-header">
          <div className="prp-header__left">
            <Users size={28} className="prp-header__icon" />
            <div>
              <h1 className="prp-header__title">Platform Users</h1>
              <p className="prp-header__subtitle">Manage user role assignments</p>
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
          <Users size={28} className="prp-header__icon" />
          <div>
            <h1 className="prp-header__title">Platform Users</h1>
            <p className="prp-header__subtitle">Manage user role assignments</p>
          </div>
        </div>
      </div>

      <section className="prp-section">
        <div className="prp-section__header">
          <h2 className="prp-section__title">
            <Users size={20} />
            User Assignments
          </h2>
          <button
            type="button"
            className="prp-btn prp-btn--primary"
            onClick={() => {
              setShowAddUser(true);
              setAddUserError(null);
            }}
          >
            <UserPlus size={18} />
            Add User
          </button>
        </div>

        {actionError && (
          <div className="prp-error prp-error--inline">
            <p>{actionError}</p>
          </div>
        )}

        {showAddUser && (
          <form className="prp-add-user-form" onSubmit={handleAddUser}>
            {addUserError && <div className="prp-add-user-form__error">{addUserError}</div>}
            <div className="prp-add-user-form__row">
              <label htmlFor="ppu-add-email" className="prp-add-user-form__label">
                Email
              </label>
              <input
                id="ppu-add-email"
                type="email"
                className="prp-add-user-form__input"
                placeholder="user@example.com"
                value={addUserEmail}
                onChange={(e) => setAddUserEmail(e.target.value)}
                required
              />
            </div>
            <div className="prp-add-user-form__row">
              <label htmlFor="ppu-add-role" className="prp-add-user-form__label">
                Role
              </label>
              <select
                id="ppu-add-role"
                className="prp-add-user-form__select"
                value={addUserRole}
                onChange={(e) => setAddUserRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="prp-add-user-form__actions">
              <button type="submit" className="prp-btn prp-btn--primary">
                Add User
              </button>
              <button
                type="button"
                className="prp-btn prp-btn--secondary"
                onClick={() => {
                  setShowAddUser(false);
                  setAddUserEmail("");
                  setAddUserError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="prp-table-wrap">
          <table className="prp-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Assigned</th>
                <th>Assigned by</th>
                <th className="prp-table__th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="prp-table__empty">
                    No users assigned yet
                  </td>
                </tr>
              ) : (
                assignments.map((u) => {
                  const roleColor = getRoleColor(u.role_slug);
                  const isEditing = editingUserEmail === u.email;

                  return (
                    <tr key={u.user_id} className="prp-table__tr">
                      <td>
                        <div className="prp-user-cell">
                          <div className="prp-user-avatar">
                            {getInitials(u.first_name, u.last_name)}
                          </div>
                          <div>
                            <div className="prp-user-name">
                              {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                            </div>
                            <div className="prp-user-email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className="prp-role-badge"
                          style={{ "--badge-color": roleColor } as React.CSSProperties}
                        >
                          {u.role_name}
                        </span>
                      </td>
                      <td>
                        <span className="prp-date-cell">
                          <Clock size={14} />
                          {formatAssignedDate(u.assigned_at)}
                        </span>
                      </td>
                      <td className="prp-assigned-by">{u.granted_by_email ?? "—"}</td>
                      <td className="prp-table__td-actions">
                        <div className="prp-actions-wrap">
                          <div className="prp-action-buttons">
                            <div className="prp-dropdown-trigger">
                              <button
                                type="button"
                                className={`prp-action-btn ${isEditing ? "prp-action-btn--active" : ""}`}
                                onClick={() => setEditingUserEmail(isEditing ? null : u.email)}
                                title="Change role"
                              >
                                <Edit3 size={16} />
                                Change Role
                                <ChevronDown
                                  size={14}
                                  className={`prp-dropdown-chevron ${isEditing ? "prp-dropdown-chevron--up" : ""}`}
                                />
                              </button>
                              {isEditing && (
                                <div className="prp-actions-dropdown">
                                  {roles.map((r) => (
                                    <button
                                      key={r.slug}
                                      type="button"
                                      className="prp-actions-dropdown__item"
                                      onClick={() => handleRoleChange(u.email, r.slug)}
                                    >
                                      {r.name}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="prp-actions-dropdown__cancel"
                                    onClick={() => setEditingUserEmail(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="prp-action-btn prp-action-btn--danger"
                              onClick={() => handleRemoveRole(u.email)}
                              title="Remove role"
                            >
                              <Trash2 size={16} />
                              Remove
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
