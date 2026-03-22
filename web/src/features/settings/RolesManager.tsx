import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  BookOpen,
  Check,
  CheckSquare,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  listPermissions,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignPermissions,
  revokePermission,
  type PermissionRecord,
  type RoleWithPermissions,
} from "../../lib/api/roles";
import { listTenantRoles, type TenantRoleRecord } from "../../lib/api/tenants";
import { ModalDialog, KidDropdown } from "../../components/ui";
import "../../components/ui/ui.css";
import "./roles-manager.css";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const STANDARD_ACTIONS = ["view", "create", "edit", "delete"] as const;

const RESOURCE_META: Record<
  string,
  { label: string; icon: React.ReactNode }
> = {
  students:    { label: "Students",    icon: <GraduationCap size={14} /> },
  classrooms:  { label: "Classrooms",  icon: <LayoutDashboard size={14} /> },
  curriculum:  { label: "Curriculum",  icon: <BookOpen size={14} /> },
  labs:        { label: "Labs",        icon: <FlaskConical size={14} /> },
  progress:    { label: "Progress",    icon: <CheckSquare size={14} /> },
  messages:    { label: "Messages",    icon: <MessageCircle size={14} /> },
  attendance:  { label: "Attendance",  icon: <Check size={14} /> },
  settings:    { label: "Settings",    icon: <KeyRound size={14} /> },
  members:     { label: "Members",     icon: <Users size={14} /> },
  roles:       { label: "Roles",       icon: <ShieldCheck size={14} /> },
  assets:      { label: "Assets",      icon: <FolderOpen size={14} /> },
  programs:    { label: "Programs",    icon: <Package size={14} /> },
  sessions:    { label: "Sessions",    icon: <LayoutDashboard size={14} /> },
};

const RESOURCE_ORDER = Object.keys(RESOURCE_META);

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function buildPermKey(p: PermissionRecord) {
  return `${p.resource}:${p.action}`;
}

/* ─── PermCheck — styled toggle cell ────────────────────────────────────── */

interface PermCheckProps {
  checked: boolean;
  label: string;
  onChange?: (on: boolean) => void;
  readOnly?: boolean;
  isBase?: boolean;
}

function PermCheck({ checked, label, onChange, readOnly, isBase }: PermCheckProps) {
  if (readOnly) {
    return (
      <div
        className={`rm__perm-check rm__perm-check--readonly ${checked ? "rm__perm-check--on" : "rm__perm-check--off"}`}
        aria-label={label}
        title={label}
      >
        {checked ? <Check size={13} strokeWidth={3} aria-hidden /> : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={isBase ? `${label} (from base role)` : label}
      className={`rm__perm-check ${checked ? "rm__perm-check--on" : ""} ${isBase && !checked ? "rm__perm-check--base" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      {checked ? <Check size={13} strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

/* ─── PermissionsMatrix ─────────────────────────────────────────────────── */

interface MatrixProps {
  allPermissions: PermissionRecord[];
  selected: Set<string>; // "resource:action"
  onChange?: (key: string, on: boolean) => void;
  readOnly?: boolean;
  /** Highlight keys that came from a base role */
  baseKeys?: Set<string>;
}

function PermissionsMatrix({
  allPermissions,
  selected,
  onChange,
  readOnly = false,
  baseKeys,
}: MatrixProps) {
  const byResource = useMemo(() => {
    const map = new Map<string, PermissionRecord[]>();
    for (const p of allPermissions) {
      const list = map.get(p.resource) ?? [];
      list.push(p);
      map.set(p.resource, list);
    }
    return map;
  }, [allPermissions]);

  const specialActions = useMemo(() => {
    const extras = new Set<string>();
    for (const p of allPermissions) {
      if (!(STANDARD_ACTIONS as readonly string[]).includes(p.action)) {
        extras.add(p.action);
      }
    }
    return Array.from(extras).sort();
  }, [allPermissions]);

  const allActions = useMemo(
    () => [...STANDARD_ACTIONS, ...specialActions],
    [specialActions],
  );

  const resources = RESOURCE_ORDER.filter((r) => byResource.has(r));

  /* fixed label col + fixed-width action cols */
  const gridCols = `160px repeat(${allActions.length}, 58px)`;

  /* which column indices are "even" for alternating tint */
  const stdCount = STANDARD_ACTIONS.length; // first N cols are standard

  return (
    <div className="rm__matrix-scroll">
      <div className="rm__matrix" style={{ gridTemplateColumns: gridCols }}>
        {/* header row */}
        <div className="rm__matrix-header-corner" />
        {allActions.map((a, colIdx) => (
          <div
            key={a}
            className={[
              "rm__matrix-col-label",
              colIdx % 2 === 0 ? "rm__matrix-col--even" : "rm__matrix-col--odd",
              colIdx === stdCount ? "rm__matrix-col--special-start" : "",
            ].join(" ")}
          >
            {a}
          </div>
        ))}

        {/* data rows */}
        {resources.map((resource) => {
          const perms = byResource.get(resource) ?? [];
          const permByAction = new Map(perms.map((p) => [p.action, p]));
          const meta = RESOURCE_META[resource] ?? { label: resource, icon: null };

          return [
            <div key={`${resource}-label`} className="rm__matrix-label-cell rm__matrix-resource">
              <span className="rm__matrix-resource-icon">{meta.icon}</span>
              {meta.label}
            </div>,

            ...allActions.map((action, colIdx) => {
              const perm = permByAction.get(action);
              const key = perm ? buildPermKey(perm) : null;
              const isOn = key ? selected.has(key) : false;
              const isBase = key ? (baseKeys?.has(key) ?? false) : false;

              return (
                <div
                  key={`${resource}-${action}`}
                  className={[
                    "rm__matrix-cell",
                    colIdx % 2 === 0 ? "rm__matrix-col--even" : "rm__matrix-col--odd",
                    colIdx === stdCount ? "rm__matrix-col--special-start" : "",
                    colIdx === allActions.length - 1 ? "rm__matrix-cell--last" : "",
                  ].join(" ")}
                >
                  {perm && key ? (
                    <PermCheck
                      checked={isOn}
                      label={`${meta.label} — ${action}`}
                      onChange={key ? (on) => onChange?.(key, on) : undefined}
                      readOnly={readOnly}
                      isBase={isBase}
                    />
                  ) : (
                    <div className="rm__matrix-cell--empty" />
                  )}
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function RolesManager() {
  const [roles, setRoles] = useState<TenantRoleRecord[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [detailRole, setDetailRole] = useState<RoleWithPermissions | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* dialogs */
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editRole, setEditRole] = useState<RoleWithPermissions | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantRoleRecord | null>(null);

  /* form state */
  const [formName, setFormName] = useState("");
  const [formBaseRoleId, setFormBaseRoleId] = useState("");
  const [formSelected, setFormSelected] = useState<Set<string>>(new Set());
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Load data ──────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        listTenantRoles(),
        listPermissions().catch(() => [] as PermissionRecord[]),
      ]);
      setRoles(rolesRes);
      setAllPermissions(permsRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Load detail when role selected ─────────────────────────────────── */

  useEffect(() => {
    if (!selectedRoleId) {
      setDetailRole(null);
      return;
    }
    setDetailLoading(true);
    getRole(selectedRoleId)
      .then(setDetailRole)
      .catch(() => setDetailRole(null))
      .finally(() => setDetailLoading(false));
  }, [selectedRoleId]);

  /* ── Base role helper ────────────────────────────────────────────────── */

  const baseRolePermKeys = useMemo((): Set<string> => {
    if (!formBaseRoleId) return new Set();
    // Find base role in already-loaded list to avoid extra fetch;
    // we try to look for its perms if it's the currently loaded detailRole
    // otherwise we just return empty (perms will be fetched on demand)
    return new Set();
  }, [formBaseRoleId]);

  const handleBaseRoleChange = useCallback(
    async (roleId: string) => {
      setFormBaseRoleId(roleId);
      if (!roleId) {
        setFormSelected(new Set());
        return;
      }
      try {
        const r = await getRole(roleId);
        const keys = new Set(r.permissions.map(buildPermKey));
        setFormSelected(keys);
      } catch {
        // silently ignore
      }
    },
    [],
  );

  /* ── Open create dialog ──────────────────────────────────────────────── */

  function openCreateDialog() {
    setFormName("");
    setFormBaseRoleId("");
    setFormSelected(new Set());
    setFormError(null);
    setEditRole(null);
    setShowCreateDialog(true);
  }

  /* ── Open edit dialog ────────────────────────────────────────────────── */

  function openEditDialog(role: RoleWithPermissions) {
    setFormName(role.name);
    setFormBaseRoleId("");
    setFormSelected(new Set(role.permissions.map(buildPermKey)));
    setFormError(null);
    setEditRole(role);
    setShowCreateDialog(true);
  }

  /* ── Toggle a permission key in the form ────────────────────────────── */

  function toggleFormPerm(key: string, on: boolean) {
    setFormSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function selectAll() {
    setFormSelected(new Set(allPermissions.map(buildPermKey)));
  }

  function clearAll() {
    setFormSelected(new Set());
  }

  /* ── Save role (create or edit) ──────────────────────────────────────── */

  async function handleSaveRole(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setFormSaving(true);
    setFormError(null);

    try {
      const permKeyToId = new Map(
        allPermissions.map((p) => [buildPermKey(p), p.id]),
      );
      const permIds = Array.from(formSelected)
        .map((k) => permKeyToId.get(k))
        .filter((id): id is string => Boolean(id));

      if (editRole) {
        /* update name */
        await updateRole(editRole.id, { name: formName.trim() });

        /* diff permissions */
        const currentKeys = new Set(editRole.permissions.map(buildPermKey));
        const toAdd = permIds.filter((id) => {
          const perm = allPermissions.find((p) => p.id === id);
          return perm && !currentKeys.has(buildPermKey(perm));
        });
        const toRevoke = editRole.permissions
          .filter((p) => !formSelected.has(buildPermKey(p)))
          .map((p) => p.id);

        await Promise.all([
          toAdd.length > 0 ? assignPermissions(editRole.id, toAdd) : undefined,
          ...toRevoke.map((pid) => revokePermission(editRole.id, pid)),
        ]);

        /* refresh */
        const updated = await getRole(editRole.id);
        setDetailRole(updated);
        setRoles((prev) =>
          prev.map((r) =>
            r.id === updated.id ? { ...r, name: updated.name } : r,
          ),
        );
      } else {
        /* create */
        const newRole = await createRole({
          name: formName.trim(),
          slug: slugify(formName.trim()),
        });
        if (permIds.length > 0) {
          await assignPermissions(newRole.id, permIds);
        }
        await load();
        setSelectedRoleId(newRole.id);
      }

      setShowCreateDialog(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setFormSaving(false);
    }
  }

  /* ── Delete role ─────────────────────────────────────────────────────── */

  async function handleDeleteRole() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      if (selectedRoleId === deleteTarget.id) {
        setSelectedRoleId(null);
        setDetailRole(null);
      }
      setDeleteTarget(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete role");
    } finally {
      setDeleting(false);
    }
  }

  /* ── Merged permission list for the detail panel ────────────────────── */
  // Merges the global permission catalogue with the role's own permissions so
  // the matrix is always shown correctly, even when the /roles/permissions
  // endpoint fails or a role has custom permissions not in the global list.
  const detailMatrixPerms = useMemo((): PermissionRecord[] => {
    const combined = new Map<string, PermissionRecord>();
    for (const p of allPermissions) combined.set(p.id, p);
    for (const p of detailRole?.permissions ?? []) combined.set(p.id, p);
    return Array.from(combined.values());
  }, [allPermissions, detailRole]);

  /* ── Role list order: system first, then custom ─────────────────────── */

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) => {
        if (a.is_system !== b.is_system)
          return a.is_system ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [roles],
  );

  const roleDropdownOptions = useMemo(
    () => [
      { value: "", label: "None (start from scratch)" },
      ...sortedRoles.map((r) => ({ value: r.id, label: r.name })),
    ],
    [sortedRoles],
  );

  const isEditing = Boolean(editRole);
  const dialogTitle = isEditing ? `Edit: ${editRole!.name}` : "Create Custom Role";

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="rm" role="main" aria-label="Roles management">
      <header className="rm__header">
        <div className="rm__header-text">
          <h1 className="rm__title">Roles</h1>
          <p className="rm__subtitle">
            Manage roles and permissions for your organization
          </p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={openCreateDialog}
        >
          <ShieldPlus size={16} aria-hidden /> Create Custom Role
        </button>
      </header>

      {error && <p className="rm__error">{error}</p>}

      {loading ? (
        <div className="rm__loading">Loading roles…</div>
      ) : (
        <div className="rm__body">
          {/* ── Left: role list ── */}
          <aside className="rm__list-panel">
            <div className="rm__list-panel-header">
              <span className="rm__list-panel-title">All Roles</span>
              <span className="rm__role-count">{sortedRoles.length}</span>
            </div>

            <ul className="rm__role-list" role="listbox" aria-label="Roles">
              {sortedRoles.map((role) => (
                <li key={role.id} role="option" aria-selected={selectedRoleId === role.id}>
                  <button
                    type="button"
                    className={`rm__role-item${selectedRoleId === role.id ? " rm__role-item--active" : ""}`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <span className="rm__role-item-icon">
                      {role.is_system ? (
                        <Lock size={15} aria-hidden />
                      ) : (
                        <ShieldCheck size={15} aria-hidden />
                      )}
                    </span>
                    <span className="rm__role-item-body">
                      <span className="rm__role-item-name">{role.name}</span>
                      <span className="rm__role-item-meta">
                        <span
                          className={`rm__badge ${role.is_system ? "rm__badge--system" : "rm__badge--custom"}`}
                        >
                          {role.is_system ? "System" : "Custom"}
                        </span>
                        {!role.is_active && (
                          <span className="rm__badge rm__badge--inactive">
                            Inactive
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rm__list-footer">
              <button
                type="button"
                className="ui-btn ui-btn--secondary"
                style={{ width: "100%" }}
                onClick={openCreateDialog}
              >
                <ShieldPlus size={15} aria-hidden /> New custom role
              </button>
            </div>
          </aside>

          {/* ── Right: detail ── */}
          <section className="rm__detail-panel">
            {!selectedRoleId ? (
              <div className="rm__detail-empty">
                <ShieldAlert size={48} className="rm__detail-empty-icon" />
                <p className="rm__detail-empty-text">
                  Select a role to view its permissions
                </p>
              </div>
            ) : detailLoading ? (
              <div className="rm__loading">Loading permissions…</div>
            ) : detailRole ? (
              <>
                <div className="rm__detail-header">
                  <div className="rm__detail-header-info">
                    <div className="rm__detail-name">
                      <span className="rm__detail-name-text">
                        {detailRole.name}
                      </span>
                      <span
                        className={`rm__badge ${detailRole.is_system ? "rm__badge--system" : "rm__badge--custom"}`}
                      >
                        {detailRole.is_system ? (
                          <><Lock size={9} /> System</>
                        ) : (
                          "Custom"
                        )}
                      </span>
                      {!detailRole.is_active && (
                        <span className="rm__badge rm__badge--inactive">
                          Inactive
                        </span>
                      )}
                    </div>
                    <span className="rm__detail-slug">
                      slug: {detailRole.slug}
                    </span>
                  </div>

                  {!detailRole.is_system && (
                    <div className="rm__detail-header-actions">
                      <button
                        type="button"
                        className="ui-btn ui-btn--secondary"
                        onClick={() => openEditDialog(detailRole)}
                      >
                        <Pencil size={14} aria-hidden /> Edit
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn--danger"
                        onClick={() => setDeleteTarget(detailRole)}
                      >
                        <Trash2 size={14} aria-hidden /> Delete
                      </button>
                    </div>
                  )}
                </div>

                <div className="rm__detail-body">
                  <div className="rm__perm-count-row">
                    <span className="rm__perm-count-label">Permissions</span>
                    <span className="rm__perm-count-num">
                      {detailRole.permissions.length}
                    </span>
                  </div>

                  {detailMatrixPerms.length > 0 ? (
                    <PermissionsMatrix
                      allPermissions={detailMatrixPerms}
                      selected={
                        new Set(detailRole.permissions.map(buildPermKey))
                      }
                      readOnly
                    />
                  ) : detailRole.is_system ? (
                    <p className="rm__system-perms-note">
                      <Lock size={13} aria-hidden /> System role — permissions
                      are enforced by the platform and not stored in the
                      directory.
                    </p>
                  ) : (
                    <p className="rm__system-perms-note">
                      No permissions assigned to this role yet.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}

      {/* ── Create / Edit dialog ── */}
      <ModalDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title={dialogTitle}
        ariaLabel={dialogTitle}
        disableClose={formSaving}
        closeVariant="neutral"
        contentClassName="rm__create-dialog"
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setShowCreateDialog(false)}
              disabled={formSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="rm-role-create-form"
              className="ui-btn ui-btn--primary"
              disabled={formSaving || !formName.trim()}
            >
              {formSaving
                ? isEditing ? "Saving…" : "Creating…"
                : isEditing ? "Save changes" : "Create role"}
            </button>
          </div>
        }
      >
        <form
          id="rm-role-create-form"
          className="rm__dialog-form"
          onSubmit={(e) => void handleSaveRole(e)}
        >
          {formError && <p className="rm__error">{formError}</p>}

          <div className="rm__form-row">
            <div>
              <label htmlFor="rm-role-name">Role name</label>
              <input
                id="rm-role-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Senior Instructor"
                required
                autoFocus
              />
            </div>

            {!isEditing && (
              <div>
                <label htmlFor="rm-base-role">Base role (optional)</label>
                <KidDropdown
                  value={formBaseRoleId}
                  onChange={(v) => void handleBaseRoleChange(v)}
                  options={roleDropdownOptions}
                  ariaLabel="Copy permissions from"
                  fullWidth
                />
                <p className="rm__base-role-hint">
                  Pre-fill permissions from an existing role
                </p>
              </div>
            )}
          </div>

          {allPermissions.length > 0 && (
            <div className="rm__dialog-section">
              <div className="rm__dialog-section-title">Permissions</div>
              <div className="rm__all-toggle">
                <button
                  type="button"
                  className="rm__all-toggle-btn"
                  onClick={selectAll}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rm__all-toggle-btn"
                  onClick={clearAll}
                >
                  Clear all
                </button>
              </div>
              <div className="rm__dialog-matrix-wrap">
                <PermissionsMatrix
                  allPermissions={allPermissions}
                  selected={formSelected}
                  onChange={toggleFormPerm}
                  baseKeys={baseRolePermKeys}
                />
              </div>
            </div>
          )}
        </form>
      </ModalDialog>

      {/* ── Delete confirmation dialog ── */}
      <ModalDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Role"
        ariaLabel="Confirm delete role"
        closeVariant="neutral"
        disableClose={deleting}
        footer={
          deleteTarget ? (
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--danger"
                onClick={() => void handleDeleteRole()}
                disabled={deleting}
              >
                <Trash2 size={14} aria-hidden />
                {deleting ? "Deleting…" : "Delete role"}
              </button>
            </div>
          ) : null
        }
      >
        {deleteTarget && (
          <div className="rm__delete-body">
            <div className="rm__delete-warning">
              <ShieldAlert size={18} className="rm__delete-warning-icon" />
              <span>
                Deleting <strong>{deleteTarget.name}</strong> will remove it
                from all users who currently hold this role. This cannot be
                undone.
              </span>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
