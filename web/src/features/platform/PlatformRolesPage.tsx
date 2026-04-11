import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Lock,
  Pencil,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  UserPlus,
  UserX,
} from "lucide-react";
import {
  assignGlobalRolePermissions,
  assignRole,
  createGlobalRole,
  deleteGlobalRole,
  getGlobalPermissions,
  getGlobalRoles,
  getRoleAssignments,
  removeRole,
  revokeGlobalRolePermission,
  updateGlobalRole,
  type GlobalPermission,
  type GlobalRole,
  type RolePermissions,
  type UserAssignment,
} from "../../lib/api/platform";
import { ModalDialog } from "../../components/ui";
import "../../components/ui/ui.css";
import "../settings/roles-manager.css";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function permKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

function flattenRolePermissions(perms: RolePermissions): Set<string> {
  const out = new Set<string>();
  Object.entries(perms).forEach(([resource, actions]) => {
    actions.forEach((action) => out.add(permKey(resource, action)));
  });
  return out;
}

export function PlatformRolesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [roles, setRoles] = useState<GlobalRole[]>([]);
  const [permissions, setPermissions] = useState<GlobalPermission[]>([]);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [assignmentEmail, setAssignmentEmail] = useState("");
  const [assignmentRoleId, setAssignmentRoleId] = useState("");

  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [editRole, setEditRole] = useState<GlobalRole | null>(null);
  const [formName, setFormName] = useState("");
  const [formSelected, setFormSelected] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<GlobalRole | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes, assignmentsRes] = await Promise.all([
        getGlobalRoles(),
        getGlobalPermissions(),
        getRoleAssignments(),
      ]);
      setRoles(rolesRes.roles);
      setPermissions(permsRes.permissions);
      setAssignments(assignmentsRes.assignments);
      if (!selectedRoleId && rolesRes.roles.length > 0) {
        setSelectedRoleId(rolesRes.roles[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform roles");
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  const roleOptions = useMemo(
    () => roles.filter((r) => r.is_active),
    [roles]
  );

  const permissionsByResource = useMemo(() => {
    const map = new Map<string, GlobalPermission[]>();
    for (const p of permissions) {
      const list = map.get(p.resource) ?? [];
      list.push(p);
      map.set(p.resource, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.action.localeCompare(b.action));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function openCreateDialog() {
    setEditRole(null);
    setFormName("");
    setFormSelected(new Set());
    setShowRoleDialog(true);
  }

  function openEditDialog(role: GlobalRole) {
    setEditRole(role);
    setFormName(role.name);
    setFormSelected(flattenRolePermissions(role.permissions));
    setShowRoleDialog(true);
  }

  function togglePermission(key: string, on: boolean) {
    setFormSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleSaveRole(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const keyToPermissionId = new Map(
        permissions.map((p) => [permKey(p.resource, p.action), p.id])
      );

      if (editRole) {
        await updateGlobalRole(editRole.id, { name: formName.trim() });
        const current = flattenRolePermissions(editRole.permissions);
        const toAdd = Array.from(formSelected)
          .filter((k) => !current.has(k))
          .map((k) => keyToPermissionId.get(k))
          .filter((v): v is string => Boolean(v));
        const toRemove = Array.from(current)
          .filter((k) => !formSelected.has(k))
          .map((k) => keyToPermissionId.get(k))
          .filter((v): v is string => Boolean(v));

        if (toAdd.length > 0) {
          await assignGlobalRolePermissions(editRole.id, toAdd);
        }
        if (toRemove.length > 0) {
          await Promise.all(toRemove.map((id) => revokeGlobalRolePermission(editRole.id, id)));
        }
      } else {
        const created = await createGlobalRole({
          name: formName.trim(),
          slug: slugify(formName.trim()),
        });
        const permIds = Array.from(formSelected)
          .map((k) => keyToPermissionId.get(k))
          .filter((v): v is string => Boolean(v));
        if (permIds.length > 0) {
          await assignGlobalRolePermissions(created.id, permIds);
        }
        setSelectedRoleId(created.id);
      }

      setShowRoleDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGlobalRole(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedRoleId === deleteTarget.id) {
        setSelectedRoleId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignRole(e: FormEvent) {
    e.preventDefault();
    if (!assignmentEmail.trim() || !assignmentRoleId) return;
    const role = roles.find((r) => r.id === assignmentRoleId);
    if (!role) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await assignRole(assignmentEmail.trim(), role.slug);
      if (!res.ok) {
        throw new Error(res.error || "Failed to assign role");
      }
      setAssignmentEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoveAssignment(email: string) {
    setAssigning(true);
    setError(null);
    try {
      const res = await removeRole(email);
      if (!res.ok) {
        throw new Error(res.error || "Failed to remove role");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove role");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="rm" role="main" aria-label="Platform roles management">
      <header className="rm__header">
        <div className="rm__header-text">
          <h1 className="rm__title">Platform Roles</h1>
          <p className="rm__subtitle">Manage global roles, permissions, and assignments</p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={openCreateDialog}
          disabled={loading || saving}
        >
          <ShieldPlus size={16} aria-hidden /> Create Global Role
        </button>
      </header>

      {error && <p className="rm__error">{error}</p>}

      {loading ? (
        <div className="rm__loading">Loading roles…</div>
      ) : (
        <>
          <div className="rm__body">
            <aside className="rm__list-panel">
              <div className="rm__list-panel-header">
                <span className="rm__list-panel-title">Global Roles</span>
                <span className="rm__role-count">{roles.length}</span>
              </div>
              <ul className="rm__role-list" role="listbox" aria-label="Global roles">
                {roles.map((role) => (
                  <li key={role.id} role="option" aria-selected={selectedRoleId === role.id}>
                    <button
                      type="button"
                      className={`rm__role-item${selectedRoleId === role.id ? " rm__role-item--active" : ""}`}
                      onClick={() => setSelectedRoleId(role.id)}
                    >
                      <span className="rm__role-item-icon">
                        {role.is_system ? <Lock size={15} aria-hidden /> : <ShieldCheck size={15} aria-hidden />}
                      </span>
                      <span className="rm__role-item-body">
                        <span className="rm__role-item-name">{role.name}</span>
                        <span className="rm__role-item-meta">
                          <span className={`rm__badge ${role.is_system ? "rm__badge--system" : "rm__badge--custom"}`}>
                            {role.is_system ? "System" : "Custom"}
                          </span>
                          {!role.is_active && (
                            <span className="rm__badge rm__badge--inactive">Inactive</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="rm__detail-panel">
              {!selectedRole ? (
                <div className="rm__detail-empty">
                  <ShieldAlert size={48} className="rm__detail-empty-icon" />
                  <p className="rm__detail-empty-text">Select a role to view permissions</p>
                </div>
              ) : (
                <>
                  <div className="rm__detail-header">
                    <div className="rm__detail-header-info">
                      <div className="rm__detail-name">
                        <span className="rm__detail-name-text">{selectedRole.name}</span>
                        <span className={`rm__badge ${selectedRole.is_system ? "rm__badge--system" : "rm__badge--custom"}`}>
                          {selectedRole.is_system ? "System" : "Custom"}
                        </span>
                      </div>
                      <span className="rm__detail-slug">slug: {selectedRole.slug}</span>
                    </div>
                    {!selectedRole.is_system && (
                      <div className="rm__detail-header-actions">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={() => openEditDialog(selectedRole)}>
                          <Pencil size={14} aria-hidden /> Edit
                        </button>
                        <button type="button" className="ui-btn ui-btn--danger" onClick={() => setDeleteTarget(selectedRole)}>
                          <Trash2 size={14} aria-hidden /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rm__detail-body">
                    <div className="rm__perm-count-row">
                      <span className="rm__perm-count-label">Users</span>
                      <span className="rm__perm-count-num">{selectedRole.user_count}</span>
                    </div>
                    {Object.entries(selectedRole.permissions).map(([resource, actions]) => (
                      <div key={resource} style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 600 }}>{resource}</div>
                        <div>{actions.join(", ")}</div>
                      </div>
                    ))}
                    {Object.keys(selectedRole.permissions).length === 0 && (
                      <p className="rm__system-perms-note">No permissions assigned.</p>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          <section className="rm__detail-panel" style={{ marginTop: 16 }}>
            <div className="rm__detail-header">
              <div className="rm__detail-header-info">
                <div className="rm__detail-name">
                  <span className="rm__detail-name-text">Role Assignments</span>
                </div>
              </div>
            </div>
            <div className="rm__detail-body">
              <form onSubmit={(e) => void handleAssignRole(e)} className="rm__form-row" style={{ marginBottom: 16 }}>
                <div>
                  <label htmlFor="platform-role-email">User email</label>
                  <input
                    id="platform-role-email"
                    className="rm__field-control"
                    value={assignmentEmail}
                    onChange={(e) => setAssignmentEmail(e.target.value)}
                    placeholder="user@domain.com"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="platform-role-select">Role</label>
                  <select
                    id="platform-role-select"
                    className="rm__field-control"
                    value={assignmentRoleId}
                    onChange={(e) => setAssignmentRoleId(e.target.value)}
                    required
                  >
                    <option value="">Select role</option>
                    {roleOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ alignSelf: "end" }}>
                  <button type="submit" className="ui-btn ui-btn--primary" disabled={assigning}>
                    <UserPlus size={15} aria-hidden /> {assigning ? "Saving…" : "Assign role"}
                  </button>
                </div>
              </form>

              <div className="rm__matrix-scroll">
                <table className="rm__assign-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th align="left">Email</th>
                      <th align="left">Name</th>
                      <th align="left">Role</th>
                      <th align="left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((item) => (
                      <tr key={`${item.user_id}-${item.role_slug}`}>
                        <td>{item.email}</td>
                        <td>{`${item.first_name || ""} ${item.last_name || ""}`.trim() || "-"}</td>
                        <td>{item.role_name}</td>
                        <td>
                          <button
                            type="button"
                            className="ui-btn ui-btn--danger"
                            onClick={() => void handleRemoveAssignment(item.email)}
                            disabled={assigning}
                          >
                            <UserX size={14} aria-hidden /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {assignments.length === 0 && (
                      <tr>
                        <td colSpan={4}>No assignments found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <ModalDialog
        isOpen={showRoleDialog}
        onClose={() => setShowRoleDialog(false)}
        title={editRole ? `Edit: ${editRole.name}` : "Create Global Role"}
        ariaLabel="Global role dialog"
        disableClose={saving}
        closeVariant="neutral"
        contentClassName="rm__create-dialog"
        footer={
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setShowRoleDialog(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="platform-role-form" className="ui-btn ui-btn--primary" disabled={saving || !formName.trim()}>
              {saving ? "Saving…" : editRole ? "Save changes" : "Create role"}
            </button>
          </div>
        }
      >
        <form id="platform-role-form" className="rm__dialog-form" onSubmit={(e) => void handleSaveRole(e)}>
          <div className="rm__form-row">
            <div>
              <label htmlFor="platform-role-name">Role name</label>
              <input
                id="platform-role-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Platform Auditor"
                required
              />
            </div>
          </div>
          <div className="rm__dialog-section">
            <div className="rm__dialog-section-title">Permissions</div>
            {permissionsByResource.map(([resource, resourcePerms]) => (
              <div key={resource} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{resource}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {resourcePerms.map((p) => {
                    const key = permKey(p.resource, p.action);
                    const checked = formSelected.has(key);
                    return (
                      <label key={p.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => togglePermission(key, e.target.checked)}
                        />
                        <span>{p.action}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Global Role"
        ariaLabel="Delete global role"
        closeVariant="neutral"
        disableClose={saving}
        footer={
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="ui-btn ui-btn--danger" onClick={() => void handleDeleteRole()} disabled={saving}>
              <Trash2 size={14} aria-hidden /> {saving ? "Deleting…" : "Delete role"}
            </button>
          </div>
        }
      >
        <div className="rm__delete-body">
          <div className="rm__delete-warning">
            <ShieldAlert size={18} className="rm__delete-warning-icon" />
            <span>Deleting this role removes it from all assigned users.</span>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
