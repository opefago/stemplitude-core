import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ArrowRight, CheckCircle2, Clock, BookOpen } from "lucide-react";
import { getMyAssignments, type StudentAssignment } from "../../lib/api/students";
import "./assignments.css";

function submissionStatusLabel(status?: string | null): string {
  if (status === "submitted") return "Submitted";
  if (status === "draft") return "Draft saved";
  return "Not started";
}

function submissionStatusClass(status?: string | null): string {
  if (status === "submitted") return "sa-badge sa-badge--submitted";
  if (status === "draft") return "sa-badge sa-badge--draft";
  return "sa-badge sa-badge--pending";
}

export function StudentAssignmentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "submitted">("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getMyAssignments(200);
        if (!mounted) return;
        setItems(rows);
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load assignments");
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const dueSoon = useMemo(
    () =>
      items.filter((item) => {
        if (!item.due_at) return false;
        return new Date(item.due_at).getTime() >= Date.now();
      }),
    [items],
  );

  const filtered = useMemo(() => {
    if (filter === "pending") return items.filter((i) => !i.submission_status || i.submission_status === "draft");
    if (filter === "submitted") return items.filter((i) => i.submission_status === "submitted");
    return items;
  }, [items, filter]);

  const openAssignment = (item: StudentAssignment) => {
    navigate(`/app/classrooms/${item.classroom_id}?tab=assignments`);
  };

  return (
    <section className="student-assignments" aria-label="Student assignments">
      <header className="student-assignments__header">
        <h1>Assignments</h1>
        <p>Track due work and submit your progress.</p>
      </header>

      {loading ? <p className="student-assignments__empty">Loading assignments…</p> : null}
      {error ? <p className="student-assignments__error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="student-assignments__empty">No assignments have been posted yet.</p>
      ) : null}

      {!loading && items.length > 0 && (
        <>
          {dueSoon.length > 0 && (
            <div className="sa-due-soon">
              <h2 className="sa-section-title">
                <Clock size={16} aria-hidden /> Due soon
              </h2>
              <ul className="sa-list" role="list">
                {dueSoon.slice(0, 4).map((item) => (
                  <li key={`${item.session_id}:${item.id}`} className="sa-item sa-item--urgent">
                    <div className="sa-item-main">
                      <span className="sa-item-title">{item.title}</span>
                      <span className="sa-item-meta">{item.classroom_name} · Due {new Date(item.due_at!).toLocaleDateString()}</span>
                    </div>
                    <span className={submissionStatusClass(item.submission_status)}>
                      {submissionStatusLabel(item.submission_status)}
                    </span>
                    <button type="button" className="sa-open-btn" onClick={() => openAssignment(item)}>
                      Open <ArrowRight size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sa-filter-row">
            {(["all", "pending", "submitted"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`sa-filter-btn${filter === f ? " sa-filter-btn--active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "pending" ? "Pending" : "Submitted"}
              </button>
            ))}
          </div>

          <ul className="sa-list" role="list">
            {filtered.map((item) => (
              <li key={`${item.session_id}:${item.id}`} className="sa-item">
                <div className="sa-item-icon">
                  {item.submission_status === "submitted"
                    ? <CheckCircle2 size={18} className="sa-icon--done" aria-hidden />
                    : <BookOpen size={18} className="sa-icon--pending" aria-hidden />}
                </div>
                <div className="sa-item-main">
                  <span className="sa-item-title">{item.title}</span>
                  <span className="sa-item-meta">
                    {item.classroom_name} · Session {new Date(item.session_start).toLocaleDateString()}
                    {item.due_at ? ` · Due ${new Date(item.due_at).toLocaleDateString()}` : ""}
                  </span>
                  {item.instructions && (
                    <span className="sa-item-instructions">{item.instructions}</span>
                  )}
                </div>
                <span className={submissionStatusClass(item.submission_status)}>
                  {submissionStatusLabel(item.submission_status)}
                </span>
                <button type="button" className="sa-open-btn" onClick={() => openAssignment(item)}>
                  {item.submission_status === "submitted" ? "View" : "Start"} <ArrowRight size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {filtered.length === 0 && (
            <p className="student-assignments__empty">No {filter !== "all" ? filter : ""} assignments.</p>
          )}
        </>
      )}
    </section>
  );
}
