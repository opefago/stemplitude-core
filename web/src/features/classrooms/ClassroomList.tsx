import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MoreVertical, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { KidDropdown, ModalDialog } from "../../components/ui";
import { useAuth } from "../../providers/AuthProvider";
import {
  deleteClassroom,
  listClassrooms,
  listMyClassrooms,
  type ClassroomRecord,
} from "../../lib/api/classrooms";
import "../../components/ui/ui.css";
import "./classrooms.css";
import { UnlinkedClassPill } from "./UnlinkedClassPill";
import { ClassroomFormWizard } from "./ClassroomFormWizard";
import { toDisplayTime } from "./classroomFormUtils";

type ClassroomStatus = "active" | "upcoming" | "completed";

function statusLabel(status: ClassroomStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "upcoming":
      return "Upcoming";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function deriveStatus(c: ClassroomRecord): ClassroomStatus {
  if (!c.is_active) return "completed";
  if (c.starts_at) {
    const starts = new Date(c.starts_at).getTime();
    if (!Number.isNaN(starts) && starts > Date.now()) return "upcoming";
  }
  return "active";
}

export function ClassroomList() {
  const { role, isSuperAdmin, subType } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ClassroomStatus | "all">("all");
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ClassroomRecord | null>(null);
  const [deletingClassroom, setDeletingClassroom] = useState(false);
  const [rowActionMenu, setRowActionMenu] = useState<{
    classroom: ClassroomRecord;
    top: number;
    right: number;
  } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editWizardClassroomId, setEditWizardClassroomId] = useState<string | null>(null);

  const canManageClassrooms =
    isSuperAdmin || role === "admin" || role === "owner" || role === "instructor";
  const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = canManageClassrooms
          ? await listClassrooms({ limit: 200 })
          : await listMyClassrooms();
        if (!mounted) return;
        setClassrooms(rows);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load classrooms");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [canManageClassrooms]);

  useEffect(() => {
    if (!rowActionMenu) return;
    let removeListeners: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      function onDocMouseDown(e: MouseEvent) {
        const el = e.target;
        if (!(el instanceof HTMLElement)) return;
        if (el.closest("[data-classroom-row-menu]")) return;
        if (el.closest("[data-classroom-row-menu-trigger]")) return;
        setRowActionMenu(null);
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") setRowActionMenu(null);
      }
      document.addEventListener("mousedown", onDocMouseDown);
      window.addEventListener("keydown", onKeyDown);
      removeListeners = () => {
        document.removeEventListener("mousedown", onDocMouseDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, 0);
    return () => {
      window.clearTimeout(timer);
      removeListeners?.();
    };
  }, [rowActionMenu]);

  const initialCurriculumIdFromQuery = useMemo(() => {
    return new URLSearchParams(location.search).get("curriculumId");
  }, [location.search]);

  useEffect(() => {
    if (!initialCurriculumIdFromQuery || !canManageClassrooms) return;
    setShowCreate(true);
  }, [initialCurriculumIdFromQuery, canManageClassrooms]);

  const filtered = useMemo(() => {
    return classrooms.filter((c) => {
      const status = deriveStatus(c);
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filterStatus === "all" || status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [classrooms, search, filterStatus]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingClassroom(true);
    try {
      await deleteClassroom(deleteTarget.id);
      setClassrooms((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete classroom");
      setDeleteTarget(null);
    } finally {
      setDeletingClassroom(false);
    }
  };

  return (
    <div
      className="classroom-list"
      role="main"
      aria-label="Classrooms list"
    >
      <header className="classroom-list__header">
        <h1 className="classroom-list__title">Classrooms</h1>
        {canManageClassrooms && (
          <button
            type="button"
            className="classroom-list__create-btn"
            onClick={() => setShowCreate(true)}
            aria-label="Create new classroom"
          >
            <Plus size={18} aria-hidden />
            Create Classroom
          </button>
        )}
      </header>
      {error && <p className="classroom-list__empty">{error}</p>}

      {canManageClassrooms ? (
        <>
          <ClassroomFormWizard
            mode="create"
            isOpen={showCreate}
            onClose={() => setShowCreate(false)}
            navigate={navigate}
            initialCurriculumIdFromQuery={initialCurriculumIdFromQuery}
            onSuccess={async () => {
              const rows = await listClassrooms({ limit: 200 });
              setClassrooms(rows);
            }}
          />
          <ClassroomFormWizard
            mode="edit"
            isOpen={Boolean(editWizardClassroomId)}
            onClose={() => setEditWizardClassroomId(null)}
            navigate={navigate}
            editClassroomId={editWizardClassroomId}
            onSuccess={(updated) => {
              setClassrooms((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            }}
          />
        </>
      ) : null}

      <div className="classroom-list__filters">
        <div className="classroom-list__search-wrap">
          <Search
            size={18}
            className="classroom-list__search-icon"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search classrooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="classroom-list__search-input"
            aria-label="Search classrooms"
          />
        </div>
        <KidDropdown
          value={filterStatus}
          onChange={(v) => setFilterStatus(v as ClassroomStatus | "all")}
          ariaLabel="Filter by status"
          minWidth={170}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "upcoming", label: "Upcoming" },
            { value: "completed", label: "Completed" },
          ]}
        />
      </div>

      <ModalDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete classroom?"
        ariaLabel="Delete classroom"
        contentClassName="classroom-list__create-form classroom-list__create-form--dialog classroom-detail__end-dialog"
        closeVariant="neutral"
        disableClose={deletingClassroom}
      >
        {deleteTarget ? (
          <>
            <p className="classroom-detail__end-dialog-copy">
              <strong>{deleteTarget.name}</strong> and all its sessions will be permanently deactivated.
              Students will lose access immediately. This cannot be undone.
            </p>
            <div className="classroom-list__create-actions">
              <button
                type="button"
                className="classroom-list__create-btn classroom-list__create-btn--cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingClassroom}
              >
                Cancel
              </button>
              <button
                type="button"
                className="classroom-list__create-btn classroom-list__create-btn--danger"
                onClick={() => void handleConfirmDelete()}
                disabled={deletingClassroom}
              >
                {deletingClassroom ? "Deleting..." : "Delete classroom"}
              </button>
            </div>
          </>
        ) : null}
      </ModalDialog>

      <div className="classroom-list__table-wrap">
        <table className="classroom-list__table" role="grid">
          <thead>
            <tr>
              <th scope="col" style={{ width: "30%" }}>Name</th>
              <th scope="col" style={{ width: "80px" }}>Students</th>
              <th scope="col">Meeting</th>
              <th scope="col" style={{ width: "80px" }}>Status</th>
              <th scope="col" style={{ width: "90px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="classroom-list__table-empty">
                  Loading classrooms...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="classroom-list__table-empty">
                  {subType === "student"
                    ? "No classrooms assigned yet."
                    : "No classrooms yet. Create one to schedule recurring sessions."}
                </td>
              </tr>
            ) : (
              filtered.map((classroom) => {
                const schedule = (classroom.schedule ?? {}) as {
                  days?: string[];
                  time?: string;
                  end_time?: string;
                };
                const meetingDays = schedule.days?.length ? schedule.days.join(", ") : "TBD";
                const classroomTimeZone = classroom.timezone || currentTimeZone;
                const meetingTime = schedule.time
                  ? `${toDisplayTime(schedule.time)}${schedule.end_time ? ` - ${toDisplayTime(schedule.end_time)}` : ""} (${classroomTimeZone})`
                  : "TBD";
                const status = deriveStatus(classroom);
                return (
                  <tr key={classroom.id}>
                    <td className="classroom-list__table-cell--name">
                      <div className="classroom-list__name-cell">
                        <Link
                          to={`/app/classrooms/${classroom.id}`}
                          className="classroom-list__link classroom-list__name-title"
                        >
                          {classroom.name}
                        </Link>
                        <div className="classroom-list__relationship-badges classroom-list__relationship-badges--inline">
                          {classroom.curriculum_id ? (
                            <span className="classroom-list__relationship-pill">
                              {classroom.curriculum_title ?? "Linked curriculum"}
                            </span>
                          ) : (
                            <UnlinkedClassPill />
                          )}
                          {classroom.program_id ? (
                            <span className="classroom-list__relationship-pill">
                              {classroom.program_name ?? "Program"}
                              {(classroom.program_start_date || classroom.program_end_date) && (
                                <span className="classroom-list__term-label">
                                  {" · "}
                                  {classroom.program_start_date && classroom.program_end_date
                                    ? `${new Date(classroom.program_start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(classroom.program_end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                                    : classroom.program_start_date
                                      ? `From ${new Date(classroom.program_start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                                      : `Until ${new Date(classroom.program_end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                                </span>
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{classroom.max_students != null ? classroom.max_students : "No limit"}</td>
                    <td title={schedule.time ? classroomTimeZone : undefined}>
                      {meetingDays} {meetingTime}
                    </td>
                    <td>
                      <span
                        className={`classroom-list__status classroom-list__status--${status}`}
                      >
                        {statusLabel(status)}
                      </span>
                    </td>
                    <td className="classroom-list__actions-cell">
                      <div className="classroom-list__actions-group">
                        <Link
                          to={`/app/classrooms/${classroom.id}`}
                          className="classroom-list__view-link"
                        >
                          View
                        </Link>
                        {canManageClassrooms ? (
                          <button
                            type="button"
                            className="classroom-list__row-menu-trigger"
                            data-classroom-row-menu-trigger
                            aria-label={`More actions for ${classroom.name}`}
                            aria-expanded={rowActionMenu?.classroom.id === classroom.id}
                            aria-haspopup="menu"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const btn = e.currentTarget;
                              setRowActionMenu((prev) => {
                                if (prev?.classroom.id === classroom.id) return null;
                                const r = btn.getBoundingClientRect();
                                return {
                                  classroom,
                                  top: r.bottom + 6,
                                  right: Math.max(8, window.innerWidth - r.right),
                                };
                              });
                            }}
                          >
                            <MoreVertical size={18} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rowActionMenu
        ? createPortal(
            <div
              className="classroom-list__row-menu"
              data-classroom-row-menu
              role="menu"
              aria-label="Classroom actions"
              style={{
                position: "fixed",
                top: rowActionMenu.top,
                right: rowActionMenu.right,
                zIndex: 10050,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="classroom-list__row-menu-item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const targetClassroom = rowActionMenu.classroom;
                  setRowActionMenu(null);
                  setEditWizardClassroomId(targetClassroom.id);
                }}
              >
                <Pencil size={14} aria-hidden />
                Edit classroom
              </button>
              <button
                type="button"
                role="menuitem"
                className="classroom-list__row-menu-item classroom-list__row-menu-item--danger"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = rowActionMenu.classroom;
                  setRowActionMenu(null);
                  setDeleteTarget(target);
                }}
              >
                <Trash2 size={14} aria-hidden />
                Delete classroom
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
