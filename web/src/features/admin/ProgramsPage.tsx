import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronLeft, ChevronRight, Edit, Plus, Search, Users } from "lucide-react";
import {
  archiveProgram,
  createProgram,
  listPrograms,
  updateProgram,
  type Program as ApiProgram,
} from "../../lib/api/programs";
import { listCourses } from "../../lib/api/curriculum";
import { listClassrooms } from "../../lib/api/classrooms";
import { AccordionCard, DatePicker, KidDropdown, ModalDialog } from "../../components/ui";
import {
  AttendanceSettings,
  type AttendanceConfig,
} from "../classrooms/AttendanceSettings";
import "../../components/ui/ui.css";
import "./programs.css";

type ProgramStatus = "active" | "draft";
const PROGRAMS_PER_PAGE = 10;

function formatTermLabel(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

export function ProgramsPage() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<ApiProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProgramStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [relatedCurriculumCount, setRelatedCurriculumCount] = useState<Record<string, number>>({});
  const [relatedClassroomCount, setRelatedClassroomCount] = useState<Record<string, number>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createActive, setCreateActive] = useState(true);
  const [createStartDate, setCreateStartDate] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");

  const [editingProgram, setEditingProgram] = useState<ApiProgram | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  // Attendance settings for create/edit dialogs (null = inherit from tenant)
  const [createAttendance, setCreateAttendance] = useState<AttendanceConfig | null>(null);
  const [editAttendance, setEditAttendance] = useState<AttendanceConfig | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [programRows, courseRows, classroomRows] = await Promise.all([
          listPrograms({ limit: 300 }),
          listCourses({ limit: 300 }),
          listClassrooms({ limit: 300 }),
        ]);
        if (!mounted) return;
        setPrograms(programRows);
        const curriculumCounts: Record<string, number> = {};
        for (const course of courseRows) {
          if (!course.program_id) continue;
          curriculumCounts[course.program_id] = (curriculumCounts[course.program_id] ?? 0) + 1;
        }
        setRelatedCurriculumCount(curriculumCounts);
        const classCounts: Record<string, number> = {};
        for (const classroom of classroomRows) {
          if (!classroom.program_id) continue;
          classCounts[classroom.program_id] = (classCounts[classroom.program_id] ?? 0) + 1;
        }
        setRelatedClassroomCount(classCounts);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load programs");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPrograms = useMemo(() => {
    return programs.filter((p) => {
      const status: ProgramStatus = p.is_active ? "active" : "draft";
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [programs, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPrograms.length / PROGRAMS_PER_PAGE));
  const paginatedPrograms = filteredPrograms.slice(
    (page - 1) * PROGRAMS_PER_PAGE,
    page * PROGRAMS_PER_PAGE,
  );

  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  async function handleCreateProgram(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const settings = createAttendance ? { attendance: createAttendance } : {};
      const created = await createProgram({
        name: createName.trim(),
        description: createDescription.trim() || null,
        is_active: createActive,
        start_date: createStartDate || null,
        end_date: createEndDate || null,
        settings,
      });
      setPrograms((prev) => [created, ...prev]);
      setExpandedId(created.id);
      setShowCreate(false);
      setCreateName("");
      setCreateDescription("");
      setCreateActive(true);
      setCreateStartDate("");
      setCreateEndDate("");
      setCreateAttendance(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create program");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingProgram || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const existingSettings = (editingProgram.settings as Record<string, unknown> | undefined) ?? {};
      const settings = editAttendance
        ? { ...existingSettings, attendance: editAttendance }
        : { ...existingSettings, attendance: undefined };
      const updated = await updateProgram(editingProgram.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        is_active: editActive,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
        settings,
      });
      setPrograms((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditingProgram(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update program");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchiveProgram(program: ApiProgram) {
    try {
      const archived = await archiveProgram(program.id);
      setPrograms((prev) => prev.map((entry) => (entry.id === archived.id ? archived : entry)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to archive program");
    }
  }

  return (
    <div className="programs-page" role="main" aria-label="Programs management">
      <header className="programs-page__header">
        <h1 className="programs-page__title">Programs</h1>
        <div className="programs-page__header-actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} aria-hidden /> Create Program
          </button>
        </div>
      </header>
      {error ? <p className="programs-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>{error}</p> : null}
      <div className="programs-page__filters">
        <div className="programs-page__search-wrap">
          <Search size={18} className="programs-page__search-icon" aria-hidden />
          <input
            type="search"
            placeholder="Search programs..."
            className="programs-page__search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search programs"
          />
        </div>
        <KidDropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ProgramStatus | "all")}
          ariaLabel="Filter by status"
          minWidth={170}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "draft", label: "Archived / Draft" },
          ]}
        />
      </div>
      {loading ? <p className="programs-page__subtitle">Loading programs...</p> : null}
      <div className="programs-page__list">
        {paginatedPrograms.map((program) => {
          const status: ProgramStatus = program.is_active ? "active" : "draft";
          const isExpanded = expandedId === program.id;
          return (
            <AccordionCard
              key={program.id}
              expanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : program.id)}
              summary={
                <>
                  <div className="programs-page__card-title-row">
                    <h3 className="programs-page__card-title">{program.name}</h3>
                    <span className={`programs-page__badge programs-page__badge--${status}`}>
                      {status === "active" ? "Active" : "Archived"}
                    </span>
                  </div>
                  <p className="programs-page__card-desc">{program.description ?? "No description yet."}</p>
                  <div className="programs-page__card-meta">
                    {formatTermLabel(program.start_date, program.end_date) && (
                      <span className="programs-page__meta-item">
                        <Calendar size={16} aria-hidden /> {formatTermLabel(program.start_date, program.end_date)}
                      </span>
                    )}
                    <span className="programs-page__meta-item">
                      <Users size={16} aria-hidden /> Curricula: {relatedCurriculumCount[program.id] ?? 0}
                    </span>
                    <span className="programs-page__meta-item">
                      <Users size={16} aria-hidden /> Classes: {relatedClassroomCount[program.id] ?? 0}
                    </span>
                  </div>
                </>
              }
            >
              <div className="programs-page__card-detail-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary"
                  onClick={() => navigate(`/app/curriculum?programId=${program.id}&create=1`)}
                >
                  Create Curriculum
                </button>
                <button
                  type="button"
                  className="programs-page__action-btn"
                  onClick={() => {
                    setEditingProgram(program);
                    setEditName(program.name);
                    setEditDescription(program.description ?? "");
                    setEditActive(program.is_active);
                    setEditStartDate(program.start_date ?? "");
                    setEditEndDate(program.end_date ?? "");
                    const raw = (program.settings as Record<string, unknown> | undefined)?.attendance;
                    setEditAttendance(raw && typeof raw === "object" ? (raw as AttendanceConfig) : null);
                  }}
                >
                  <Edit size={16} /> Edit
                </button>
                <button
                  type="button"
                  className="programs-page__action-btn"
                  disabled={!program.is_active}
                  onClick={() => void handleArchiveProgram(program)}
                >
                  Archive
                </button>
              </div>
            </AccordionCard>
          );
        })}
      </div>
      {!loading && filteredPrograms.length > PROGRAMS_PER_PAGE && (
        <div className="programs-page__pagination" role="navigation" aria-label="Programs pagination">
          <span className="programs-page__pagination-meta">
            Showing {(page - 1) * PROGRAMS_PER_PAGE + 1}–
            {Math.min(page * PROGRAMS_PER_PAGE, filteredPrograms.length)} of {filteredPrograms.length}
          </span>
          <div className="programs-page__pagination-actions">
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft size={16} aria-hidden /> Previous
            </button>
            <span className="programs-page__pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {!loading && filteredPrograms.length === 0 ? (
        <div className="programs-page__empty-state" role="status" aria-live="polite">
          <p className="programs-page__empty-title">No programs yet</p>
          <p className="programs-page__empty-hint">Create a program, then attach curricula and classes.</p>
        </div>
      ) : null}

      <ModalDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Program"
        ariaLabel="Create Program"
        contentClassName="programs-page__dialog"
        closeVariant="neutral"
      >
        <form className="programs-page__form" onSubmit={handleCreateProgram}>
          <div className="programs-page__form-grid">
            <div className="programs-page__field programs-page__field--full">
              <label htmlFor="program-name">Name</label>
              <input id="program-name" type="text" required value={createName} onChange={(e) => setCreateName(e.target.value)} />
            </div>
            <div className="programs-page__field programs-page__field--full">
              <label htmlFor="program-desc">Description</label>
              <textarea id="program-desc" rows={3} value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
            </div>
            <div className="programs-page__field programs-page__field--full">
              <label>Status</label>
              <KidDropdown
                value={createActive ? "active" : "draft"}
                onChange={(v) => setCreateActive(v === "active")}
                ariaLabel="Program status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "draft", label: "Draft" },
                ]}
              />
            </div>
            <div className="programs-page__field">
              <label htmlFor="program-start-date">Term start (optional)</label>
              <DatePicker
                id="program-start-date"
                value={createStartDate}
                onChange={setCreateStartDate}
                placeholder="Pick start date"
                max={createEndDate || undefined}
                error={
                  createStartDate && createEndDate && createStartDate > createEndDate
                    ? "Start must be before end date"
                    : null
                }
              />
            </div>
            <div className="programs-page__field">
              <label htmlFor="program-end-date">Term end (optional)</label>
              <DatePicker
                id="program-end-date"
                value={createEndDate}
                onChange={setCreateEndDate}
                placeholder="Pick end date"
                min={createStartDate || undefined}
                error={
                  createStartDate && createEndDate && createEndDate < createStartDate
                    ? "End must be after start date"
                    : null
                }
              />
            </div>
          </div>
          <div className="programs-page__field programs-page__field--full">
            <label className="programs-page__section-label">Attendance Settings</label>
            <AttendanceSettings
              value={createAttendance}
              onChange={setCreateAttendance}
              allowInherit
              inheritLabel="Inherit from tenant"
              saving={creating}
            />
          </div>
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={creating}>
              {creating ? "Creating..." : "Create Program"}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={Boolean(editingProgram)}
        onClose={() => setEditingProgram(null)}
        title="Edit Program"
        ariaLabel="Edit Program"
        contentClassName="programs-page__dialog"
        closeVariant="neutral"
      >
        <form className="programs-page__form" onSubmit={handleSaveEdit}>
          <div className="programs-page__form-grid">
            <div className="programs-page__field programs-page__field--full">
              <label htmlFor="edit-program-name">Name</label>
              <input id="edit-program-name" type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="programs-page__field programs-page__field--full">
              <label htmlFor="edit-program-description">Description</label>
              <textarea
                id="edit-program-description"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="programs-page__field programs-page__field--full">
              <label>Status</label>
              <KidDropdown
                value={editActive ? "active" : "draft"}
                onChange={(v) => setEditActive(v === "active")}
                ariaLabel="Edit program status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "draft", label: "Archived / Draft" },
                ]}
              />
            </div>
            <div className="programs-page__field">
              <label htmlFor="edit-program-start-date">Term start (optional)</label>
              <DatePicker
                id="edit-program-start-date"
                value={editStartDate}
                onChange={setEditStartDate}
                placeholder="Pick start date"
                max={editEndDate || undefined}
                error={
                  editStartDate && editEndDate && editStartDate > editEndDate
                    ? "Start must be before end date"
                    : null
                }
              />
            </div>
            <div className="programs-page__field">
              <label htmlFor="edit-program-end-date">Term end (optional)</label>
              <DatePicker
                id="edit-program-end-date"
                value={editEndDate}
                onChange={setEditEndDate}
                placeholder="Pick end date"
                min={editStartDate || undefined}
                error={
                  editStartDate && editEndDate && editEndDate < editStartDate
                    ? "End must be after start date"
                    : null
                }
              />
            </div>
          </div>
          <div className="programs-page__field programs-page__field--full">
            <label className="programs-page__section-label">Attendance Settings</label>
            <AttendanceSettings
              value={editAttendance}
              onChange={setEditAttendance}
              allowInherit
              inheritLabel="Inherit from tenant"
              saving={savingEdit}
            />
          </div>
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setEditingProgram(null)} disabled={savingEdit}>
              Cancel
            </button>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
