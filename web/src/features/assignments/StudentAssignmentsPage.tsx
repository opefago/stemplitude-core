import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, BookOpen } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useChildContextStudentId } from "../../lib/childContext";
import { getMyAssignments, type StudentAssignment } from "../../lib/api/students";
import "../dashboard/dashboard-bento.css";
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
  const { role, subType } = useAuth();
  const childContextStudentId = useChildContextStudentId();
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "submitted">("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "upcoming" | "past">("all");

  const canLoadMyAssignments =
    subType === "student" ||
    (subType === "user" &&
      Boolean(childContextStudentId) &&
      (role === "parent" || role === "homeschool_parent"));

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!canLoadMyAssignments) {
        setLoading(false);
        setError(null);
        setItems([]);
        return;
      }
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
  }, [canLoadMyAssignments, childContextStudentId]);

  const now = Date.now();
  const dueSoon = useMemo(
    () =>
      items
        .filter((item) => {
          if (!item.due_at) return false;
          const due = new Date(item.due_at).getTime();
          return due >= now && item.submission_status !== "submitted";
        })
        .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()),
    [items, now],
  );

  const filtered = useMemo(() => {
    const isPast = (item: StudentAssignment) => {
      if (item.due_at) return new Date(item.due_at).getTime() < now;
      return new Date(item.session_end).getTime() < now;
    };
    const byStatus = (item: StudentAssignment) => {
      if (filter === "pending") return !item.submission_status || item.submission_status === "draft";
      if (filter === "submitted") return item.submission_status === "submitted";
      return true;
    };
    const byTime = (item: StudentAssignment) => {
      if (timeFilter === "upcoming") return !isPast(item);
      if (timeFilter === "past") return isPast(item);
      return true;
    };
    return items
      .filter((item) => byStatus(item) && byTime(item))
      .sort((a, b) => {
        const aSubmitted = a.submission_status === "submitted" ? 1 : 0;
        const bSubmitted = b.submission_status === "submitted" ? 1 : 0;
        if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
        const aDue = a.due_at ? new Date(a.due_at).getTime() : new Date(a.session_end).getTime();
        const bDue = b.due_at ? new Date(b.due_at).getTime() : new Date(b.session_end).getTime();
        return aDue - bDue;
      });
  }, [items, filter, timeFilter, now]);

  const openAssignment = (item: StudentAssignment) => {
    navigate(`/app/classrooms/${item.classroom_id}?tab=assignments`);
  };

  return (
    <section className="dashboard-bento student-assignments" aria-label="Student assignments">
      <header className="dashboard-bento__header student-assignments__header">
        <h1>Assignments</h1>
        <p>Track due work and submit your progress.</p>
      </header>

      {loading ? <p className="student-assignments__empty">Loading assignments…</p> : null}
      {error ? <p className="student-assignments__error">{error}</p> : null}
      {canLoadMyAssignments && !loading && !error && items.length === 0 ? (
        <p className="student-assignments__empty">No assignments have been posted yet.</p>
      ) : null}

      {canLoadMyAssignments && !loading && items.length > 0 && (
        <>
          {dueSoon.length > 0 && (
            <div className="dashboard-bento__card dashboard-bento__card--orange sa-due-soon">
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

          <div className="dashboard-bento__card dashboard-bento__card--blue sa-all-card">
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
            <div className="sa-filter-row sa-filter-row--secondary">
              {(["all", "upcoming", "past"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`sa-filter-btn${timeFilter === f ? " sa-filter-btn--active" : ""}`}
                  onClick={() => setTimeFilter(f)}
                >
                  {f === "all" ? "All time" : f === "upcoming" ? "Upcoming" : "Past"}
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
                  {item.submission_status === "submitted" ? (
                    <span className="sa-done-pill">Done</span>
                  ) : (
                    <button type="button" className="sa-open-btn" onClick={() => openAssignment(item)}>
                      Start <ArrowRight size={13} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {filtered.length === 0 && (
              <p className="student-assignments__empty">No assignments match this filter.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
