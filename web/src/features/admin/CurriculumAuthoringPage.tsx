import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Plus, Trash2 } from "lucide-react";
import {
  createAssignmentTemplate,
  createRubricTemplate,
  deleteAssignmentTemplate,
  deleteRubricTemplate,
  listAssignmentTemplates,
  listCourses,
  listLessonLabs,
  listLessons,
  listModules,
  listRubricTemplates,
  updateAssignmentTemplate,
  updateRubricTemplate,
  type AssignmentTemplate,
  type Course,
  type CurriculumLab,
  type CurriculumLesson,
  type CurriculumModule,
  type RubricCriterionDefinition,
  type RubricTemplate,
} from "../../lib/api/curriculum";
import {
  KidCheckbox,
  KidDropdown,
  ModalDialog,
  SearchableDropdown,
} from "../../components/ui";
import "../../components/ui/ui.css";
import "./curriculum.css";
import "./curriculum-authoring.css";

type Tab = "rubrics" | "assignments";

function criterionRow(): RubricCriterionDefinition & { key: string } {
  return {
    key: crypto.randomUUID(),
    criterion_id: "",
    label: "",
    max_points: 10,
    description: "",
  };
}

export function CurriculumAuthoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "assignments" ? "assignments" : "rubrics";
  const courseIdFromUrl = searchParams.get("courseId");

  const [courses, setCourses] = useState<Course[]>([]);
  const [rubrics, setRubrics] = useState<RubricTemplate[]>([]);
  const [assignments, setAssignments] = useState<AssignmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const [rubricSaving, setRubricSaving] = useState(false);
  const [editingRubric, setEditingRubric] = useState<RubricTemplate | null>(null);
  const [rubricTitle, setRubricTitle] = useState("");
  const [rubricDescription, setRubricDescription] = useState("");
  const [rubricRows, setRubricRows] = useState(() => [criterionRow(), criterionRow()]);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentTemplate | null>(null);
  const [asgTitle, setAsgTitle] = useState("");
  const [asgInstructions, setAsgInstructions] = useState("");
  const [asgCourseId, setAsgCourseId] = useState<string>("");
  const [asgModuleId, setAsgModuleId] = useState<string>("");
  const [asgLessonId, setAsgLessonId] = useState<string>("");
  const [asgLabId, setAsgLabId] = useState<string>("");
  const [asgRubricId, setAsgRubricId] = useState<string>("");
  const [asgUseRubric, setAsgUseRubric] = useState(true);
  const [asgRequiresLab, setAsgRequiresLab] = useState(false);
  const [asgRequiresAssets, setAsgRequiresAssets] = useState(false);
  const [asgAllowEdit, setAsgAllowEdit] = useState(false);
  const [asgSortOrder, setAsgSortOrder] = useState(0);
  const [asgInlineRubricOpen, setAsgInlineRubricOpen] = useState(false);
  const [asgInlineRubricSaving, setAsgInlineRubricSaving] = useState(false);
  const [asgInlineRubricTitle, setAsgInlineRubricTitle] = useState("");
  const [asgInlineRubricDescription, setAsgInlineRubricDescription] = useState("");
  const [asgInlineRubricRows, setAsgInlineRubricRows] = useState(() => [criterionRow(), criterionRow()]);

  const [modules, setModules] = useState<CurriculumModule[]>([]);
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [labs, setLabs] = useState<CurriculumLab[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(false);

  const createHandled = useRef(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [courseRows, rubricRows, assignmentRows] = await Promise.all([
        listCourses({ limit: 400 }),
        listRubricTemplates({ limit: 400 }),
        listAssignmentTemplates({ limit: 400 }),
      ]);
      setCourses(courseRows);
      setRubrics(rubricRows);
      setAssignments(assignmentRows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load curriculum authoring data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (createHandled.current) return;
    const create = searchParams.get("create");
    if (!create) return;
    createHandled.current = true;
    if (create === "rubric") {
      setEditingRubric(null);
      setRubricTitle("");
      setRubricDescription("");
      setRubricRows([criterionRow(), criterionRow()]);
      setRubricModalOpen(true);
    } else if (create === "assignment") {
      resetAssignmentForm();
      if (courseIdFromUrl) setAsgCourseId(courseIdFromUrl);
      setEditingAssignment(null);
      setAssignmentModalOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, courseIdFromUrl]);

  function resetAssignmentForm() {
    setAsgTitle("");
    setAsgInstructions("");
    setAsgCourseId(courseIdFromUrl ?? "");
    setAsgModuleId("");
    setAsgLessonId("");
    setAsgLabId("");
    setAsgRubricId("");
    setAsgUseRubric(true);
    setAsgRequiresLab(false);
    setAsgRequiresAssets(false);
    setAsgAllowEdit(false);
    setAsgSortOrder(0);
    setAsgInlineRubricOpen(false);
    setAsgInlineRubricSaving(false);
    setAsgInlineRubricTitle("");
    setAsgInlineRubricDescription("");
    setAsgInlineRubricRows([criterionRow(), criterionRow()]);
    setModules([]);
    setLessons([]);
    setLabs([]);
  }

  function activateExistingRubricMode() {
    setAsgInlineRubricOpen(false);
  }

  function activateInlineRubricMode() {
    setAsgRubricId("");
    setAsgInlineRubricOpen(true);
  }

  async function createRubricFromAssignmentBuilder() {
    if (!asgInlineRubricTitle.trim()) {
      setError("Rubric title is required.");
      return;
    }
    const criteria: RubricCriterionDefinition[] = asgInlineRubricRows
      .filter((r) => r.criterion_id.trim())
      .map((r) => ({
        criterion_id: r.criterion_id.trim(),
        label: r.label?.trim() || null,
        max_points: Math.min(1000, Math.max(1, Number(r.max_points) || 1)),
        description: r.description?.trim() || null,
      }));
    if (criteria.length === 0) {
      setError("Add at least one rubric criterion with an ID.");
      return;
    }
    setAsgInlineRubricSaving(true);
    setError(null);
    try {
      const created = await createRubricTemplate({
        title: asgInlineRubricTitle.trim(),
        description: asgInlineRubricDescription.trim() || null,
        criteria,
      });
      setRubrics((prev) => [created, ...prev]);
      setAsgRubricId(created.id);
      setAsgUseRubric(true);
      setAsgInlineRubricOpen(false);
      setAsgInlineRubricTitle("");
      setAsgInlineRubricDescription("");
      setAsgInlineRubricRows([criterionRow(), criterionRow()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create rubric");
    } finally {
      setAsgInlineRubricSaving(false);
    }
  }

  useEffect(() => {
    if (!asgCourseId) {
      setModules([]);
      setAsgModuleId("");
      return;
    }
    let cancelled = false;
    setLoadingStructure(true);
    void listModules(asgCourseId)
      .then((rows) => {
        if (!cancelled) setModules(rows);
      })
      .catch(() => {
        if (!cancelled) setModules([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStructure(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asgCourseId]);

  useEffect(() => {
    if (!asgModuleId) {
      setLessons([]);
      setAsgLessonId("");
      return;
    }
    let cancelled = false;
    setLoadingStructure(true);
    void listLessons(asgModuleId)
      .then((rows) => {
        if (!cancelled) setLessons(rows);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStructure(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asgModuleId]);

  useEffect(() => {
    if (!editingAssignment?.lesson_id || !asgCourseId || !assignmentModalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const mods = await listModules(asgCourseId);
        if (cancelled) return;
        for (const m of mods) {
          const ls = await listLessons(m.id);
          if (cancelled) return;
          if (ls.some((l) => l.id === editingAssignment.lesson_id)) {
            setAsgModuleId(m.id);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingAssignment, asgCourseId, assignmentModalOpen]);

  useEffect(() => {
    if (!asgLessonId) {
      setLabs([]);
      setAsgLabId("");
      return;
    }
    let cancelled = false;
    setLoadingStructure(true);
    void listLessonLabs(asgLessonId)
      .then((rows) => {
        if (cancelled) return;
        setLabs(rows);
        if (
          editingAssignment &&
          asgLessonId === editingAssignment.lesson_id &&
          editingAssignment.lab_id &&
          rows.some((l) => l.id === editingAssignment.lab_id)
        ) {
          setAsgLabId(editingAssignment.lab_id);
        }
      })
      .catch(() => {
        if (!cancelled) setLabs([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStructure(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asgLessonId, editingAssignment]);

  function setTab(next: Tab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams);
  }

  function openCreateRubric() {
    setEditingRubric(null);
    setRubricTitle("");
    setRubricDescription("");
    setRubricRows([criterionRow(), criterionRow()]);
    setRubricModalOpen(true);
  }

  function openEditRubric(row: RubricTemplate) {
    setEditingRubric(row);
    setRubricTitle(row.title);
    setRubricDescription(row.description ?? "");
    const crit = (row.criteria ?? []) as RubricCriterionDefinition[];
    setRubricRows(
      crit.length
        ? crit.map((c) => ({
            key: crypto.randomUUID(),
            criterion_id: c.criterion_id,
            label: c.label ?? "",
            max_points: c.max_points,
            description: c.description ?? "",
          }))
        : [criterionRow()],
    );
    setRubricModalOpen(true);
  }

  async function submitRubric(e: FormEvent) {
    e.preventDefault();
    if (!rubricTitle.trim()) return;
    const criteria: RubricCriterionDefinition[] = rubricRows
      .filter((r) => r.criterion_id.trim())
      .map((r) => ({
        criterion_id: r.criterion_id.trim(),
        label: r.label?.trim() || null,
        max_points: Math.min(1000, Math.max(1, Number(r.max_points) || 1)),
        description: r.description?.trim() || null,
      }));
    if (criteria.length === 0) {
      setError("Add at least one rubric criterion with an ID.");
      return;
    }
    setRubricSaving(true);
    setError(null);
    try {
      if (editingRubric) {
        const updated = await updateRubricTemplate(editingRubric.id, {
          title: rubricTitle.trim(),
          description: rubricDescription.trim() || null,
          criteria,
        });
        setRubrics((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await createRubricTemplate({
          title: rubricTitle.trim(),
          description: rubricDescription.trim() || null,
          criteria,
        });
        setRubrics((prev) => [created, ...prev]);
      }
      setRubricModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save rubric");
    } finally {
      setRubricSaving(false);
    }
  }

  function openCreateAssignment() {
    resetAssignmentForm();
    setEditingAssignment(null);
    setAssignmentModalOpen(true);
  }

  function openEditAssignment(row: AssignmentTemplate) {
    setEditingAssignment(row);
    setAsgTitle(row.title);
    setAsgInstructions(row.instructions ?? "");
    setAsgCourseId(row.course_id ?? "");
    setAsgModuleId("");
    setAsgLessonId(row.lesson_id ?? "");
    setAsgLabId(row.lab_id ?? "");
    setAsgRubricId(row.rubric_template_id ?? "");
    setAsgUseRubric(row.use_rubric);
    setAsgRequiresLab(row.requires_lab);
    setAsgRequiresAssets(row.requires_assets);
    setAsgAllowEdit(row.allow_edit_after_submit);
    setAsgSortOrder(row.sort_order);
    setAssignmentModalOpen(true);
  }

  async function submitAssignment(e: FormEvent) {
    e.preventDefault();
    if (!asgTitle.trim()) return;
    const payload = {
      title: asgTitle.trim(),
      instructions: asgInstructions.trim() || null,
      course_id: asgCourseId || null,
      lesson_id: asgLessonId || null,
      lab_id: asgLabId || null,
      rubric_template_id: asgRubricId || null,
      use_rubric: asgUseRubric,
      requires_lab: asgRequiresLab,
      requires_assets: asgRequiresAssets,
      allow_edit_after_submit: asgAllowEdit,
      sort_order: asgSortOrder,
    };
    setAssignmentSaving(true);
    setError(null);
    try {
      if (editingAssignment) {
        const updated = await updateAssignmentTemplate(editingAssignment.id, payload);
        setAssignments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await createAssignmentTemplate(payload);
        setAssignments((prev) => [created, ...prev]);
      }
      setAssignmentModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save assignment template");
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function removeRubric(row: RubricTemplate) {
    if (!window.confirm(`Delete rubric template "${row.title}"?`)) return;
    try {
      await deleteRubricTemplate(row.id);
      setRubrics((prev) => prev.filter((x) => x.id !== row.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function removeAssignment(row: AssignmentTemplate) {
    if (!window.confirm(`Delete assignment template "${row.title}"?`)) return;
    try {
      await deleteAssignmentTemplate(row.id);
      setAssignments((prev) => prev.filter((x) => x.id !== row.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const courseTitleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of courses) m[c.id] = c.title;
    return m;
  }, [courses]);

  const rubricTitleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rubrics) m[r.id] = r.title;
    return m;
  }, [rubrics]);

  return (
    <div className="curriculum-page curriculum-authoring" role="main" aria-label="Curriculum authoring">
      <header className="curriculum-page__header">
        <div>
          <Link to="/app/curriculum" className="curriculum-authoring__back">
            <ArrowLeft size={18} aria-hidden /> Curriculum list
          </Link>
          <h1 className="curriculum-page__title">Rubric & assignment templates</h1>
          <p className="curriculum-page__subtitle">
            Define reusable rubrics and assignment shells for your courses. Instructors attach these when they run a
            class session.
          </p>
        </div>
      </header>

      {error && (
        <p className="curriculum-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>
          {error}
        </p>
      )}

      <div className="curriculum-authoring__tabs" role="tablist" aria-label="Authoring sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rubrics"}
          className={`curriculum-authoring__tab ${tab === "rubrics" ? "curriculum-authoring__tab--active" : ""}`}
          onClick={() => setTab("rubrics")}
        >
          <ClipboardList size={18} aria-hidden /> Rubric templates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assignments"}
          className={`curriculum-authoring__tab ${tab === "assignments" ? "curriculum-authoring__tab--active" : ""}`}
          onClick={() => setTab("assignments")}
        >
          <ClipboardList size={18} aria-hidden /> Assignment templates
        </button>
      </div>

      {tab === "rubrics" && (
        <section className="curriculum-authoring__panel" aria-labelledby="rubrics-heading">
          <div className="curriculum-authoring__panel-head">
            <h2 id="rubrics-heading" className="curriculum-authoring__panel-title">
              Rubric templates
            </h2>
            <button type="button" className="ui-btn ui-btn--primary" onClick={openCreateRubric}>
              <Plus size={18} aria-hidden /> New rubric
            </button>
          </div>
          {loading ? (
            <p className="curriculum-page__subtitle">Loading…</p>
          ) : rubrics.length === 0 ? (
            <p className="curriculum-page__subtitle">No rubric templates yet. Create one to reuse grading criteria.</p>
          ) : (
            <ul className="curriculum-authoring__list">
              {rubrics.map((r) => (
                <li key={r.id} className="curriculum-authoring__row">
                  <div>
                    <strong>{r.title}</strong>
                    <span className="curriculum-authoring__meta">
                      {(r.criteria?.length ?? 0)} criteria
                      {r.description ? ` · ${r.description.slice(0, 80)}${r.description.length > 80 ? "…" : ""}` : ""}
                    </span>
                  </div>
                  <div className="curriculum-authoring__row-actions">
                    <button type="button" className="curriculum-page__action-btn" onClick={() => openEditRubric(r)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="curriculum-page__action-btn"
                      onClick={() => void removeRubric(r)}
                      aria-label={`Delete ${r.title}`}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "assignments" && (
        <section className="curriculum-authoring__panel" aria-labelledby="assign-heading">
          <div className="curriculum-authoring__panel-head">
            <h2 id="assign-heading" className="curriculum-authoring__panel-title">
              Assignment templates
            </h2>
            <button type="button" className="ui-btn ui-btn--primary" onClick={openCreateAssignment}>
              <Plus size={18} aria-hidden /> New assignment template
            </button>
          </div>
          {loading ? (
            <p className="curriculum-page__subtitle">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="curriculum-page__subtitle">
              No assignment templates yet. Link a course, optional lesson/lab, and an optional rubric.
            </p>
          ) : (
            <ul className="curriculum-authoring__list">
              {assignments.map((a) => (
                <li key={a.id} className="curriculum-authoring__row">
                  <div>
                    <strong>{a.title}</strong>
                    <span className="curriculum-authoring__meta">
                      {a.course_id ? courseTitleById[a.course_id] ?? "Course" : "Unscoped"}
                      {a.use_rubric && a.rubric_template_id
                        ? ` · Rubric: ${rubricTitleById[a.rubric_template_id] ?? "Linked"}`
                        : a.use_rubric
                          ? " · Rubric: (none)"
                          : " · Holistic (no rubric)"}
                    </span>
                  </div>
                  <div className="curriculum-authoring__row-actions">
                    <button type="button" className="curriculum-page__action-btn" onClick={() => openEditAssignment(a)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="curriculum-page__action-btn"
                      onClick={() => void removeAssignment(a)}
                      aria-label={`Delete ${a.title}`}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ModalDialog
        isOpen={rubricModalOpen}
        onClose={() => setRubricModalOpen(false)}
        title={editingRubric ? "Edit rubric template" : "New rubric template"}
        ariaLabel="Rubric template form"
        contentClassName="curriculum-page__form-section curriculum-page__form-section--dialog"
        footer={
          <div className="ui-form-actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setRubricModalOpen(false)} disabled={rubricSaving}>
              Cancel
            </button>
            <button type="submit" form="curriculum-authoring-rubric-form" className="ui-btn ui-btn--primary" disabled={rubricSaving}>
              {rubricSaving ? "Saving…" : editingRubric ? "Save" : "Create"}
            </button>
          </div>
        }
      >
        <form id="curriculum-authoring-rubric-form" className="curriculum-page__form" onSubmit={submitRubric}>
          <div className="curriculum-page__form-grid">
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="rubric-t-title">Title</label>
              <input
                id="rubric-t-title"
                value={rubricTitle}
                onChange={(e) => setRubricTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="rubric-t-desc">Description (optional)</label>
              <textarea
                id="rubric-t-desc"
                rows={2}
                value={rubricDescription}
                onChange={(e) => setRubricDescription(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
          <p className="curriculum-page__field-hint">Each row needs a stable criterion id (for analytics) and max points.</p>
          <ul className="curriculum-authoring__criteria">
            {rubricRows.map((row, idx) => (
              <li key={row.key} className="curriculum-authoring__criteria-row">
                <div className="curriculum-page__field">
                  <label htmlFor={`crit-id-${row.key}`}>Criterion id</label>
                  <input
                    id={`crit-id-${row.key}`}
                    value={row.criterion_id}
                    onChange={(e) =>
                      setRubricRows((prev) =>
                        prev.map((x) => (x.key === row.key ? { ...x, criterion_id: e.target.value } : x)),
                      )
                    }
                    maxLength={80}
                  />
                </div>
                <div className="curriculum-page__field">
                  <label htmlFor={`crit-label-${row.key}`}>Label</label>
                  <input
                    id={`crit-label-${row.key}`}
                    value={row.label ?? ""}
                    onChange={(e) =>
                      setRubricRows((prev) =>
                        prev.map((x) => (x.key === row.key ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    maxLength={200}
                  />
                </div>
                <div className="curriculum-page__field curriculum-authoring__criteria-max">
                  <label htmlFor={`crit-max-${row.key}`}>Max pts</label>
                  <input
                    id={`crit-max-${row.key}`}
                    type="number"
                    min={1}
                    max={1000}
                    value={row.max_points}
                    onChange={(e) =>
                      setRubricRows((prev) =>
                        prev.map((x) =>
                          x.key === row.key ? { ...x, max_points: Number(e.target.value) || 1 } : x,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="curriculum-authoring__criteria-remove"
                  onClick={() => setRubricRows((prev) => prev.filter((x) => x.key !== row.key))}
                  aria-label={`Remove criterion ${idx + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ui-btn ui-btn--secondary curriculum-authoring__add-criterion"
            onClick={() => setRubricRows((prev) => [...prev, criterionRow()])}
          >
            <Plus size={16} aria-hidden /> Add criterion
          </button>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        title={editingAssignment ? "Edit assignment template" : "New assignment template"}
        ariaLabel="Assignment template form"
        contentClassName="curriculum-page__form-section curriculum-page__form-section--dialog"
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => setAssignmentModalOpen(false)}
              disabled={assignmentSaving}
            >
              Cancel
            </button>
            <button type="submit" form="curriculum-authoring-assignment-form" className="ui-btn ui-btn--primary" disabled={assignmentSaving}>
              {assignmentSaving ? "Saving…" : editingAssignment ? "Save" : "Create"}
            </button>
          </div>
        }
      >
        <form id="curriculum-authoring-assignment-form" className="curriculum-page__form" onSubmit={submitAssignment}>
          <div className="curriculum-page__form-grid">
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="asg-title">Title</label>
              <input id="asg-title" value={asgTitle} onChange={(e) => setAsgTitle(e.target.value)} required maxLength={200} />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label htmlFor="asg-inst">Instructions (optional)</label>
              <textarea id="asg-inst" rows={3} value={asgInstructions} onChange={(e) => setAsgInstructions(e.target.value)} />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Course (optional)</label>
              <KidDropdown
                value={asgCourseId || "none"}
                onChange={(v) => {
                  setAsgCourseId(v === "none" ? "" : v);
                  setAsgModuleId("");
                  setAsgLessonId("");
                  setAsgLabId("");
                }}
                fullWidth
                ariaLabel="Course scope"
                options={[
                  { value: "none", label: "Not tied to a course" },
                  ...courses.map((c) => ({ value: c.id, label: c.title })),
                ]}
              />
            </div>
            {asgCourseId ? (
              <>
                <div className="curriculum-page__field curriculum-page__field--full">
                  <label>Module</label>
                  <KidDropdown
                    value={asgModuleId || "none"}
                    onChange={(v) => {
                      setAsgModuleId(v === "none" ? "" : v);
                      setAsgLessonId("");
                      setAsgLabId("");
                    }}
                    fullWidth
                    ariaLabel="Module"
                    disabled={loadingStructure && modules.length === 0}
                    options={[
                      {
                        value: "none",
                        label: modules.length
                          ? "Select module"
                          : "No modules yet — add modules & lessons to this course first",
                      },
                      ...modules.map((m) => ({ value: m.id, label: m.title })),
                    ]}
                  />
                </div>
                <div className="curriculum-page__field curriculum-page__field--full">
                  <label>Lesson</label>
                  <KidDropdown
                    value={asgLessonId || "none"}
                    onChange={(v) => {
                      setAsgLessonId(v === "none" ? "" : v);
                      setAsgLabId("");
                    }}
                    fullWidth
                    ariaLabel="Lesson"
                    disabled={!asgModuleId}
                    options={[
                      { value: "none", label: asgModuleId ? (lessons.length ? "Select lesson" : "No lessons") : "Pick a module first" },
                      ...lessons.map((l) => ({ value: l.id, label: l.title })),
                    ]}
                  />
                </div>
                <div className="curriculum-page__field curriculum-page__field--full">
                  <label>Curriculum lab (optional)</label>
                  <KidDropdown
                    value={asgLabId || "none"}
                    onChange={(v) => setAsgLabId(v === "none" ? "" : v)}
                    fullWidth
                    ariaLabel="Lab"
                    disabled={!asgLessonId}
                    options={[
                      { value: "none", label: asgLessonId ? (labs.length ? "No specific lab" : "No labs on this lesson") : "Pick a lesson first" },
                      ...labs.map((l) => ({ value: l.id, label: `${l.title} (${l.lab_type})` })),
                    ]}
                  />
                </div>
              </>
            ) : null}
            <div className="curriculum-page__field curriculum-page__field--full">
              <label>Rubric (choose one)</label>
              <p className="curriculum-page__field-hint">
                Pick an existing rubric or create one inline. Selecting one option negates the other.
              </p>
              <div className="track-lessons-actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={asgInlineRubricOpen ? "kid-button kid-button--ghost" : "kid-button"}
                  onClick={activateExistingRubricMode}
                >
                  Choose existing rubric
                </button>
                <button
                  type="button"
                  className={asgInlineRubricOpen ? "kid-button" : "kid-button kid-button--ghost"}
                  onClick={activateInlineRubricMode}
                >
                  Create inline rubric
                </button>
              </div>
              {!asgInlineRubricOpen ? (
                <SearchableDropdown
                  value={asgRubricId || "none"}
                  onChange={(v) => {
                    setAsgRubricId(v === "none" ? "" : v);
                    setAsgInlineRubricOpen(false);
                  }}
                  placeholder="Select rubric template"
                  searchPlaceholder="Search rubric templates..."
                  emptyLabel="No rubric templates found"
                  fullWidth
                  ariaLabel="Rubric template"
                  options={[
                    { value: "none", label: "None", searchText: "no rubric" },
                    ...rubrics.map((r) => ({
                      value: r.id,
                      label: r.title,
                      searchText: `${r.description ?? ""} ${(r.criteria?.map((c) => `${c.criterion_id} ${c.label ?? ""}`).join(" ")) ?? ""}`,
                    })),
                  ]}
                />
              ) : null}
              {asgInlineRubricOpen ? (
                <div className="curriculum-page__form-section" style={{ marginTop: 10 }}>
                  <div className="curriculum-page__form-grid">
                    <div className="curriculum-page__field curriculum-page__field--full">
                      <label htmlFor="asg-inline-rubric-title">Rubric title</label>
                      <input
                        id="asg-inline-rubric-title"
                        value={asgInlineRubricTitle}
                        onChange={(e) => setAsgInlineRubricTitle(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                    <div className="curriculum-page__field curriculum-page__field--full">
                      <label htmlFor="asg-inline-rubric-desc">Description (optional)</label>
                      <textarea
                        id="asg-inline-rubric-desc"
                        rows={2}
                        value={asgInlineRubricDescription}
                        onChange={(e) => setAsgInlineRubricDescription(e.target.value)}
                        maxLength={1000}
                      />
                    </div>
                  </div>
                  <ul className="curriculum-authoring__criteria">
                    {asgInlineRubricRows.map((row, idx) => (
                      <li key={row.key} className="curriculum-authoring__criteria-row">
                        <div className="curriculum-page__field">
                          <label htmlFor={`asg-inline-crit-id-${row.key}`}>Criterion id</label>
                          <input
                            id={`asg-inline-crit-id-${row.key}`}
                            value={row.criterion_id}
                            onChange={(e) =>
                              setAsgInlineRubricRows((prev) =>
                                prev.map((x) => (x.key === row.key ? { ...x, criterion_id: e.target.value } : x)),
                              )
                            }
                            maxLength={80}
                          />
                        </div>
                        <div className="curriculum-page__field">
                          <label htmlFor={`asg-inline-crit-label-${row.key}`}>Label</label>
                          <input
                            id={`asg-inline-crit-label-${row.key}`}
                            value={row.label ?? ""}
                            onChange={(e) =>
                              setAsgInlineRubricRows((prev) =>
                                prev.map((x) => (x.key === row.key ? { ...x, label: e.target.value } : x)),
                              )
                            }
                            maxLength={200}
                          />
                        </div>
                        <div className="curriculum-page__field curriculum-authoring__criteria-max">
                          <label htmlFor={`asg-inline-crit-max-${row.key}`}>Max pts</label>
                          <input
                            id={`asg-inline-crit-max-${row.key}`}
                            type="number"
                            min={1}
                            max={1000}
                            value={row.max_points}
                            onChange={(e) =>
                              setAsgInlineRubricRows((prev) =>
                                prev.map((x) =>
                                  x.key === row.key ? { ...x, max_points: Number(e.target.value) || 1 } : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="curriculum-authoring__criteria-remove"
                          onClick={() =>
                            setAsgInlineRubricRows((prev) =>
                              prev.length > 1 ? prev.filter((x) => x.key !== row.key) : prev,
                            )
                          }
                          aria-label={`Remove inline criterion ${idx + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="track-lessons-actions">
                    <button
                      type="button"
                      className="kid-button kid-button--ghost"
                      onClick={() => setAsgInlineRubricRows((prev) => [...prev, criterionRow()])}
                    >
                      <Plus size={16} aria-hidden /> Add criterion
                    </button>
                    <button
                      type="button"
                      className="kid-button"
                      onClick={() => void createRubricFromAssignmentBuilder()}
                      disabled={asgInlineRubricSaving}
                    >
                      {asgInlineRubricSaving ? "Creating..." : "Create rubric and attach"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="curriculum-page__field">
              <label htmlFor="asg-sort">Sort order</label>
              <input
                id="asg-sort"
                type="number"
                value={asgSortOrder}
                onChange={(e) => setAsgSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="curriculum-page__field curriculum-page__field--full curriculum-authoring__toggles">
              <KidCheckbox checked={asgUseRubric} onChange={setAsgUseRubric}>
                Use rubric when grading
              </KidCheckbox>
              <KidCheckbox checked={asgRequiresLab} onChange={setAsgRequiresLab}>
                Requires lab work
              </KidCheckbox>
              <KidCheckbox checked={asgRequiresAssets} onChange={setAsgRequiresAssets}>
                Requires uploads / assets
              </KidCheckbox>
              <KidCheckbox checked={asgAllowEdit} onChange={setAsgAllowEdit}>
                Allow edit after submit
              </KidCheckbox>
            </div>
          </div>
        </form>
      </ModalDialog>

      <details className="curriculum-authoring__help">
        <summary className="curriculum-authoring__help-summary">How this connects to classes</summary>
        <p className="curriculum-page__subtitle curriculum-page__subtitle--compact">
          Assignment templates are reusable. During a live session, instructors add an assignment from a template so
          students see instructions and you can grade against the rubric snapshot.
        </p>
      </details>
    </div>
  );
}
