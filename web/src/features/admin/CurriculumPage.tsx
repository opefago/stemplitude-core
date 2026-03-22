import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  createCourse,
  deleteCourse,
  listCourses,
  updateCourse,
  type Course,
} from "../../lib/api/curriculum";
import { listPrograms, type Program } from "../../lib/api/programs";
import { listClassrooms } from "../../lib/api/classrooms";
import { PERMITTED_LAB_OPTIONS } from "../../lib/permittedLabs";
import { AccordionCard, KidDropdown, ModalDialog } from "../../components/ui";
import "../../components/ui/ui.css";
import "./curriculum.css";

type CurriculumLevel = "beginner" | "intermediate" | "advanced";
type CurriculumStatus = "published" | "draft";
const CURRICULA_PER_PAGE = 10;

export function CurriculumPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [curricula, setCurricula] = useState<Course[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<CurriculumLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CurriculumStatus | "all">("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLevel, setCreateLevel] = useState<CurriculumLevel>("beginner");
  const [createPublished, setCreatePublished] = useState(false);
  const [createProgramId, setCreateProgramId] = useState<string>("");
  const [createDefaultPermittedLabs, setCreateDefaultPermittedLabs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Course | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLevel, setEditLevel] = useState<CurriculumLevel>("beginner");
  const [editPublished, setEditPublished] = useState(false);
  const [editProgramId, setEditProgramId] = useState<string>("");
  const [editDefaultPermittedLabs, setEditDefaultPermittedLabs] = useState<string[]>([]);
  const [assignedClassroomCount, setAssignedClassroomCount] = useState<Record<string, number>>({});

  const toggleDefaultLab = (lab: string, setState: Dispatch<SetStateAction<string[]>>) => {
    setState((prev) => (prev.includes(lab) ? prev.filter((v) => v !== lab) : [...prev, lab]));
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [courses, programRows, classroomRows] = await Promise.all([
          listCourses({ limit: 300 }),
          listPrograms({ limit: 300 }),
          listClassrooms({ limit: 300 }),
        ]);
        if (!mounted) return;
        setCurricula(courses);
        setPrograms(programRows);
        const counts: Record<string, number> = {};
        for (const classroom of classroomRows) {
          if (!classroom.curriculum_id) continue;
          counts[classroom.curriculum_id] = (counts[classroom.curriculum_id] ?? 0) + 1;
        }
        setAssignedClassroomCount(counts);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load curricula");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoCreate = params.get("create") === "1";
    if (!autoCreate) return;
    setShowCreateForm(true);
    const prefilledProgramId = params.get("programId");
    if (prefilledProgramId) setCreateProgramId(prefilledProgramId);
  }, [location.search]);

  const filteredCurricula = useMemo(() => {
    return curricula.filter((c) => {
      const matchesSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.description ?? "").toLowerCase().includes(search.toLowerCase());
      const difficulty = (c.difficulty ?? "beginner").toLowerCase();
      const matchesLevel = levelFilter === "all" || difficulty === levelFilter;
      const status: CurriculumStatus = c.is_published ? "published" : "draft";
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesProgram = programFilter === "all" || c.program_id === programFilter;
      return matchesSearch && matchesLevel && matchesStatus && matchesProgram;
    });
  }, [curricula, search, levelFilter, statusFilter, programFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCurricula.length / CURRICULA_PER_PAGE));
  const paginatedCurricula = filteredCurricula.slice(
    (page - 1) * CURRICULA_PER_PAGE,
    page * CURRICULA_PER_PAGE,
  );

  useEffect(() => { setPage(1); }, [search, levelFilter, statusFilter, programFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  async function handleCreateCurriculum(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const created = await createCourse({
        title: createName.trim(),
        description: createDescription.trim() || null,
        difficulty: createLevel,
        is_published: createPublished,
        program_id: createProgramId || null,
        default_permitted_labs: createDefaultPermittedLabs.length ? createDefaultPermittedLabs : null,
      });
      setCurricula((prev) => [created, ...prev]);
      setExpandedId(created.id);
      setShowCreateForm(false);
      setCreateName("");
      setCreateDescription("");
      setCreateLevel("beginner");
      setCreatePublished(false);
      setCreateProgramId("");
      setCreateDefaultPermittedLabs([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create curriculum");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const updated = await updateCourse(editing.id, {
        title: editName.trim(),
        description: editDescription.trim() || null,
        difficulty: editLevel,
        is_published: editPublished,
        program_id: editProgramId || null,
        default_permitted_labs: editDefaultPermittedLabs,
      });
      setCurricula((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update curriculum");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchiveCurriculum(course: Course) {
    try {
      if (!course.is_published) {
        await deleteCourse(course.id);
        setCurricula((prev) => prev.filter((entry) => entry.id !== course.id));
        if (expandedId === course.id) setExpandedId(null);
        return;
      }
      const updated = await updateCourse(course.id, { is_published: false });
      setCurricula((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to archive curriculum");
    }
  }

  return (
    <div className="curriculum-page" role="main" aria-label="Curriculum management">
      <header className="curriculum-page__header">
        <h1 className="curriculum-page__title">Curriculum</h1>
        {error && <p className="curriculum-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>{error}</p>}
        <div className="curriculum-page__header-actions">
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={18} aria-hidden /> Create Curriculum
          </button>
        </div>
      </header>

      <div className="curriculum-page__filters">
        <div className="curriculum-page__search-wrap">
          <Search size={18} className="curriculum-page__search-icon" aria-hidden />
          <input
            type="search"
            placeholder="Search curricula..."
            className="curriculum-page__search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search curricula"
          />
        </div>
        <KidDropdown
          value={levelFilter}
          onChange={(v) => setLevelFilter(v as CurriculumLevel | "all")}
          ariaLabel="Filter by level"
          minWidth={160}
          options={[
            { value: "all", label: "All levels" },
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
        <KidDropdown
          value={programFilter}
          onChange={(v) => setProgramFilter(v)}
          ariaLabel="Filter by program"
          minWidth={180}
          options={[
            { value: "all", label: "All programs" },
            ...programs.map((program) => ({ value: program.id, label: program.name })),
          ]}
        />
        <KidDropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as CurriculumStatus | "all")}
          ariaLabel="Filter by status"
          minWidth={170}
          options={[
            { value: "all", label: "All statuses" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      <div className="curriculum-page__list">
        {loading && <p className="curriculum-page__subtitle">Loading curricula...</p>}
        {paginatedCurricula.map((curriculum) => {
          const status: CurriculumStatus = curriculum.is_published ? "published" : "draft";
          const isExpanded = expandedId === curriculum.id;
          return (
            <AccordionCard
              key={curriculum.id}
              expanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : curriculum.id)}
              summary={
                <>
                  <div className="curriculum-page__card-header">
                    <div className="curriculum-page__card-title-row">
                      <h3 className="curriculum-page__card-title">{curriculum.title}</h3>
                    </div>
                    <span className={`curriculum-page__badge curriculum-page__badge--${status}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="curriculum-page__card-desc">{curriculum.description ?? "No description yet."}</p>
                  <div className="curriculum-page__card-meta">
                    <span className="curriculum-page__meta-item curriculum-page__meta-item--level">
                      {(curriculum.difficulty ?? "beginner").toUpperCase()}
                    </span>
                    <span className="curriculum-page__meta-item">
                      Program: {programs.find((entry) => entry.id === curriculum.program_id)?.name ?? "Standalone"}
                    </span>
                    <span className="curriculum-page__meta-item">
                      Classes: {assignedClassroomCount[curriculum.id] ?? 0}
                    </span>
                    <span className="curriculum-page__meta-item">
                      Default labs: {(curriculum.default_permitted_labs ?? []).length || "—"}
                    </span>
                  </div>
                </>
              }
            >
              <p className="curriculum-page__subtitle curriculum-page__subtitle--compact">
                <strong>Default permitted labs</strong> (new classes):{" "}
                {(curriculum.default_permitted_labs ?? []).length
                  ? (curriculum.default_permitted_labs ?? []).join(", ")
                  : "None — teachers pick labs when creating a class, or set defaults in Edit."}
              </p>
              <div className="curriculum-page__card-detail-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary"
                  onClick={() => navigate(`/app/classrooms?curriculumId=${curriculum.id}`)}
                >
                  Create Class With Curriculum
                </button>
                <button
                  type="button"
                  className="curriculum-page__action-btn"
                  onClick={() => {
                    setEditing(curriculum);
                    setEditName(curriculum.title);
                    setEditDescription(curriculum.description ?? "");
                    setEditLevel((curriculum.difficulty as CurriculumLevel) ?? "beginner");
                    setEditPublished(curriculum.is_published);
                    setEditProgramId(curriculum.program_id ?? "");
                    setEditDefaultPermittedLabs(curriculum.default_permitted_labs ?? []);
                  }}
                >
                  Edit
                </button>
                <button type="button" className="curriculum-page__action-btn" onClick={() => void handleArchiveCurriculum(curriculum)}>
                  Archive
                </button>
              </div>
            </AccordionCard>
          );
        })}
      </div>
      {!loading && filteredCurricula.length > CURRICULA_PER_PAGE && (
        <div className="curriculum-page__pagination" role="navigation" aria-label="Curriculum pagination">
          <span className="curriculum-page__pagination-meta">
            Showing {(page - 1) * CURRICULA_PER_PAGE + 1}–
            {Math.min(page * CURRICULA_PER_PAGE, filteredCurricula.length)} of {filteredCurricula.length}
          </span>
          <div className="curriculum-page__pagination-actions">
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft size={16} aria-hidden /> Previous
            </button>
            <span className="curriculum-page__pagination-page">
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
      {!loading && filteredCurricula.length === 0 && (
        <div className="curriculum-page__empty-state" role="status" aria-live="polite">
          <p className="curriculum-page__empty-title">No curriculum yet</p>
          <p className="curriculum-page__empty-hint">
            Start by creating a curriculum, then add lessons and approve labs for admins to preview.
          </p>
        </div>
      )}

      <ModalDialog
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title="Create Curriculum"
        ariaLabel="Create Curriculum"
        contentClassName="curriculum-page__form-section curriculum-page__form-section--dialog"
      >
        <form className="curriculum-page__form" onSubmit={handleCreateCurriculum}>
          <div className="curriculum-page__form-grid">
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="curriculum-name">Name</label>
              <input id="curriculum-name" type="text" required value={createName} onChange={(e) => setCreateName(e.target.value)} />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="curriculum-desc">Description</label>
              <textarea id="curriculum-desc" rows={3} value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
            </div>
            <div className="curriculum-page__field">
              <label>Level</label>
              <KidDropdown
                value={createLevel}
                onChange={(v) => setCreateLevel(v as CurriculumLevel)}
                fullWidth
                ariaLabel="Curriculum level"
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
              />
            </div>
            <div className="curriculum-page__field">
              <label>Program (optional)</label>
              <KidDropdown
                value={createProgramId || "none"}
                onChange={(v) => setCreateProgramId(v === "none" ? "" : v)}
                fullWidth
                ariaLabel="Assign program"
                options={[
                  { value: "none", label: "Standalone Curriculum" },
                  ...programs.map((program) => ({ value: program.id, label: program.name })),
                ]}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Status</label>
              <KidDropdown
                value={createPublished ? "published" : "draft"}
                onChange={(v) => setCreatePublished(v === "published")}
                fullWidth
                ariaLabel="Curriculum status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                ]}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Default permitted labs (optional)</label>
              <p className="curriculum-page__field-hint">
                Prefills lab access when someone creates a class linked to this curriculum. Teachers can still change them.
              </p>
              <div className="curriculum-page__chip-group" role="group" aria-label="Default permitted labs">
                {PERMITTED_LAB_OPTIONS.map((lab) => (
                  <button
                    key={lab}
                    type="button"
                    className={`curriculum-page__chip ${createDefaultPermittedLabs.includes(lab) ? "curriculum-page__chip--active" : ""}`}
                    onClick={() => toggleDefaultLab(lab, setCreateDefaultPermittedLabs)}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setShowCreateForm(false)} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Curriculum"
        ariaLabel="Edit Curriculum"
        contentClassName="curriculum-page__form-section curriculum-page__form-section--dialog"
      >
        <form className="curriculum-page__form" onSubmit={handleSaveEdit}>
          <div className="curriculum-page__form-grid">
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="edit-curriculum-name">Name</label>
              <input id="edit-curriculum-name" type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="edit-curriculum-desc">Description</label>
              <textarea id="edit-curriculum-desc" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="curriculum-page__field">
              <label>Level</label>
              <KidDropdown
                value={editLevel}
                onChange={(v) => setEditLevel(v as CurriculumLevel)}
                fullWidth
                ariaLabel="Edit level"
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
              />
            </div>
            <div className="curriculum-page__field">
              <label>Program (optional)</label>
              <KidDropdown
                value={editProgramId || "none"}
                onChange={(v) => setEditProgramId(v === "none" ? "" : v)}
                fullWidth
                ariaLabel="Edit program"
                options={[
                  { value: "none", label: "Standalone Curriculum" },
                  ...programs.map((program) => ({ value: program.id, label: program.name })),
                ]}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Status</label>
              <KidDropdown
                value={editPublished ? "published" : "draft"}
                onChange={(v) => setEditPublished(v === "published")}
                fullWidth
                ariaLabel="Edit status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                ]}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Default permitted labs (optional)</label>
              <p className="curriculum-page__field-hint">
                Prefills lab access for new classes linked to this curriculum. Clear all chips to remove defaults.
              </p>
              <div className="curriculum-page__chip-group" role="group" aria-label="Default permitted labs">
                {PERMITTED_LAB_OPTIONS.map((lab) => (
                  <button
                    key={lab}
                    type="button"
                    className={`curriculum-page__chip ${editDefaultPermittedLabs.includes(lab) ? "curriculum-page__chip--active" : ""}`}
                    onClick={() => toggleDefaultLab(lab, setEditDefaultPermittedLabs)}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setEditing(null)} disabled={savingEdit}>
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
