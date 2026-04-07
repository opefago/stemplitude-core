import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, BookOpen } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useChildContextStudentId } from "../../lib/childContext";
import {
  getMyAssignments,
  getParentChildAssignments,
  type StudentAssignment,
} from "../../lib/api/students";
import "../dashboard/dashboard-bento.css";
import "./assignments.css";

const PAGE_SIZE = 10;

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
  const [searchParams] = useSearchParams();
  const { role, subType } = useAuth();
  const childContextStudentId = useChildContextStudentId();
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "submitted">("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "upcoming" | "past">("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [page, setPage] = useState(1);

  const studentIdFromUrl = searchParams.get("studentId")?.trim() || null;
  const isGuardianViewer =
    subType === "user" && (role === "parent" || role === "homeschool_parent");
  const canActOnAssignments = subType === "student";
  const guardianLearnerId = isGuardianViewer
    ? studentIdFromUrl || childContextStudentId
    : null;

  const canLoadMyAssignments =
    subType === "student" || (isGuardianViewer && Boolean(guardianLearnerId));

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
        const rows =
          subType === "student"
            ? await getMyAssignments(200)
            : await getParentChildAssignments(guardianLearnerId!, 200);
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
  }, [canLoadMyAssignments, subType, guardianLearnerId]);

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
    const dueTime = (item: StudentAssignment) => {
      return item.due_at ? new Date(item.due_at).getTime() : new Date(item.session_end).getTime();
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
    const byDueDate = (item: StudentAssignment) => {
      const due = dueTime(item);
      if (dueFrom) {
        const from = new Date(`${dueFrom}T00:00:00`).getTime();
        if (!Number.isNaN(from) && due < from) return false;
      }
      if (dueTo) {
        const to = new Date(`${dueTo}T23:59:59`).getTime();
        if (!Number.isNaN(to) && due > to) return false;
      }
      return true;
    };
    return items
      .filter((item) => byStatus(item) && byTime(item) && byDueDate(item))
      .sort((a, b) => {
        const aSubmitted = a.submission_status === "submitted" ? 1 : 0;
        const bSubmitted = b.submission_status === "submitted" ? 1 : 0;
        if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
        const aDue = dueTime(a);
        const bDue = dueTime(b);
        return aDue - bDue;
      });
  }, [items, filter, timeFilter, dueFrom, dueTo, now]);

  useEffect(() => {
    setPage(1);
  }, [filter, timeFilter, dueFrom, dueTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart],
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const openAssignment = (item: StudentAssignment) => {
    navigate(`/app/classrooms/${item.classroom_id}?tab=assignments`);
  };

  return (
    <section className="dashboard-bento student-assignments" aria-label="Student assignments">
      <header className="dashboard-bento__header student-assignments__header">
        <h1>Assignments</h1>
        <p>
          {isGuardianViewer
            ? "Track due work and submissions for your learner."
            : "Track due work and submit your progress."}
        </p>
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
                    {!canActOnAssignments ? (
                      <span className="sa-readonly-pill">View only</span>
                    ) : (
                      <button type="button" className="sa-open-btn" onClick={() => openAssignment(item)}>
                        Open <ArrowRight size={13} aria-hidden />
                      </button>
                    )}
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
            <div className="sa-filter-row sa-filter-row--dates">
              <label className="sa-date-filter">
                <span>Due from</span>
                <input
                  type="date"
                  value={dueFrom}
                  onChange={(e) => setDueFrom(e.target.value)}
                  className="sa-date-input"
                />
              </label>
              <label className="sa-date-filter">
                <span>Due to</span>
                <input
                  type="date"
                  value={dueTo}
                  onChange={(e) => setDueTo(e.target.value)}
                  className="sa-date-input"
                />
              </label>
            </div>

            <ul className="sa-list" role="list">
              {paged.map((item) => (
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
                  {!canActOnAssignments ? (
                    <span className="sa-readonly-pill">
                      {item.submission_status === "submitted"
                        ? "Done"
                        : item.submission_status === "draft"
                          ? "Draft"
                          : "To do"}
                    </span>
                  ) : item.submission_status === "submitted" ? (
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
            {filtered.length > 0 && (
              <nav className="sa-pager" aria-label="Assignments pages">
                <button
                  type="button"
                  className="sa-open-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="sa-pager__meta">
                  Page {page} of {totalPages} · {filtered.length} items
                </span>
                <button
                  type="button"
                  className="sa-open-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}
