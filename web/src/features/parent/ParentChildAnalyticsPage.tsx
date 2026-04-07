import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DatePicker, KidDropdown, StatCard } from "../../components/ui";
import {
  getParentChildren,
  getParentChildActivity,
  getParentChildAssignmentGrades,
  getParentChildAttendanceOverview,
  type GuardianAttendanceSessionRow,
  type ParentActivityItem,
  type ParentChildAssignmentGrades,
  type StudentProfile,
} from "../../lib/api/students";
import "../../components/ui/ui.css";
import "../dashboard/dashboard-bento.css";
import "./parent-analytics.css";

const LOOKBACK_DAYS = 180;
const BINS = 12;
const PAGE_LIMIT = 100;
const ACTIVITY_PAGE_SIZE = 10;

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || "Student";
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - LOOKBACK_DAYS);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function inDateRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T23:59:59.999Z`).getTime();
  return t >= a && t <= b;
}

function parseXp(item: ParentActivityItem): number {
  const text = `${item.title ?? ""} ${item.detail ?? ""}`;
  const m = text.match(/([+-]?\d+)\s*XP/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function isPresentish(status?: string | null): boolean {
  const v = (status ?? "").toLowerCase();
  return v === "present" || v === "late" || v === "excused";
}

function monthLabel(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatOccurredAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildBins(
  fromIso: string,
  toIso: string,
  activityItems: ParentActivityItem[],
  attendanceRows: GuardianAttendanceSessionRow[],
) {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T23:59:59.999Z`).getTime();
  const span = Math.max(1, to - from);
  const width = span / BINS;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    label: monthLabel(from + i * width),
    progress: 0,
    attendanceGood: 0,
    attendanceMarked: 0,
  }));
  const idx = (t: number) => Math.max(0, Math.min(BINS - 1, Math.floor((t - from) / width)));

  for (const item of activityItems) {
    const t = new Date(item.occurred_at).getTime();
    if (t < from || t > to) continue;
    const i = idx(t);
    if (item.kind === "lesson_completed" || item.kind === "lab_completed" || item.kind === "assignment_submitted") {
      bins[i]!.progress += 1;
    }
  }
  for (const row of attendanceRows) {
    const t = new Date(row.session_start).getTime();
    if (t < from || t > to) continue;
    if (!row.attendance_status) continue;
    const i = idx(t);
    bins[i]!.attendanceMarked += 1;
    if (isPresentish(row.attendance_status)) bins[i]!.attendanceGood += 1;
  }
  return bins.map((b) => ({
    ...b,
    attendanceRate: b.attendanceMarked > 0 ? Math.round((b.attendanceGood / b.attendanceMarked) * 100) : 0,
  }));
}

export function ParentChildAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(defaultRange, []);
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"graphs" | "activity">("graphs");
  const [activityPage, setActivityPage] = useState(1);
  const [activityItems, setActivityItems] = useState<ParentActivityItem[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<GuardianAttendanceSessionRow[]>([]);
  const [grades, setGrades] = useState<ParentChildAssignmentGrades | null>(null);

  const studentParam = (searchParams.get("studentId") ?? "").trim();
  const from = (searchParams.get("from") ?? defaults.from).trim();
  const to = (searchParams.get("to") ?? defaults.to).trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingChildren(true);
      try {
        const rows = await getParentChildren();
        if (!cancelled) setChildren(rows);
      } catch {
        if (!cancelled) setChildren([]);
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeStudentId = useMemo(() => {
    if (studentParam && children.some((c) => c.id === studentParam)) return studentParam;
    return children[0]?.id ?? "";
  }, [children, studentParam]);

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!activeStudentId) {
      setActivityItems([]);
      setAttendanceRows([]);
      setGrades(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const allItems: ParentActivityItem[] = [];
        let skip = 0;
        while (skip < 1000) {
          const page = await getParentChildActivity(activeStudentId, {
            skip,
            limit: PAGE_LIMIT,
            occurred_after: `${from}T00:00:00.000Z`,
            occurred_before: `${to}T23:59:59.999Z`,
          });
          allItems.push(...page.items);
          skip += page.items.length;
          if (skip >= page.total || page.items.length < PAGE_LIMIT) break;
        }
        const [attendance, assignmentGrades] = await Promise.all([
          getParentChildAttendanceOverview(activeStudentId),
          getParentChildAssignmentGrades(activeStudentId, {
            skip: 0,
            limit: 100,
            graded_after: `${from}T00:00:00.000Z`,
            graded_before: `${to}T23:59:59.999Z`,
          }),
        ]);
        if (cancelled) return;
        setActivityItems(allItems);
        setAttendanceRows(attendance.rows);
        setGrades(assignmentGrades);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load analytics");
        setActivityItems([]);
        setAttendanceRows([]);
        setGrades(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStudentId, from, to]);

  const stats = useMemo(() => {
    const items = activityItems.filter((i) => inDateRange(i.occurred_at, from, to));
    const lessons = items.filter((i) => i.kind === "lesson_completed").length;
    const labs = items.filter((i) => i.kind === "lab_completed").length;
    const submitted = items.filter((i) => i.kind === "assignment_submitted").length;
    const xp = items.filter((i) => i.kind === "xp_earned").reduce((sum, i) => sum + parseXp(i), 0);

    const now = Date.now();
    const attendance = attendanceRows.filter(
      (r) =>
        inDateRange(r.session_start, from, to) &&
        new Date(r.session_start).getTime() <= now &&
        Boolean(r.attendance_status),
    );
    const attendanceRate = attendance.length
      ? Math.round((attendance.filter((r) => isPresentish(r.attendance_status)).length / attendance.length) * 100)
      : 0;

    const g = grades?.grades ?? [];
    const avgGrade = g.length ? Math.round(g.reduce((sum, it) => sum + it.score, 0) / g.length) : 0;
    const bins = buildBins(from, to, items, attendanceRows);
    return { lessons, labs, submitted, xp, attendanceRate, avgGrade, bins };
  }, [activityItems, attendanceRows, grades, from, to]);

  const activityRows = useMemo(() => {
    return activityItems
      .filter((item) => inDateRange(item.occurred_at, from, to))
      .slice()
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }, [activityItems, from, to]);

  const activityTotalPages = Math.max(1, Math.ceil(activityRows.length / ACTIVITY_PAGE_SIZE));
  const activityCurrentPage = Math.min(activityPage, activityTotalPages);
  const activityStart = (activityCurrentPage - 1) * ACTIVITY_PAGE_SIZE;
  const pagedActivityRows = activityRows.slice(activityStart, activityStart + ACTIVITY_PAGE_SIZE);

  useEffect(() => {
    setActivityPage(1);
  }, [activeStudentId, from, to, tab]);

  const maxProgress = Math.max(1, ...stats.bins.map((b) => b.progress));
  const activeChild = children.find((c) => c.id === activeStudentId);
  const learnerOptions = useMemo(
    () =>
      children.map((c) => ({
        value: c.id,
        label: childLabel(c),
      })),
    [children],
  );

  return (
    <div className="parent-analytics-page dashboard-bento" role="main" aria-label="Child analytics">
      <header className="parent-analytics-page__header">
        <Link to="/app" className="parent-analytics-page__crumb">
          <ChevronLeft size={18} aria-hidden /> Dashboard
        </Link>
        <h1 className="parent-analytics-page__title">Child analytics</h1>
        <p className="parent-analytics-page__subtitle">
          Progress trends, attendance trends, and key performance insights over time.
        </p>
      </header>

      {loadingChildren ? (
        <p className="parent-analytics-page__muted">Loading learners…</p>
      ) : children.length === 0 ? (
        <p className="parent-analytics-page__muted">No linked learners in this workspace.</p>
      ) : (
        <>
          <div className="parent-analytics-page__toolbar">
            <label>
              Learner
              <KidDropdown
                value={activeStudentId}
                options={learnerOptions}
                onChange={(value) => patchParams({ studentId: value })}
                ariaLabel="Select learner"
                fullWidth
              />
            </label>
            <label>
              From
              <DatePicker
                value={from}
                onChange={(value) => patchParams({ from: value || null })}
                id="parent-analytics-from"
                placeholder="From date"
              />
            </label>
            <label>
              To
              <DatePicker
                value={to}
                onChange={(value) => patchParams({ to: value || null })}
                id="parent-analytics-to"
                placeholder="To date"
              />
            </label>
          </div>
          <div className="parent-analytics-page__tabs" role="tablist" aria-label="Analytics views">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "graphs"}
              className={`parent-analytics-page__tab ${tab === "graphs" ? "parent-analytics-page__tab--active" : ""}`}
              onClick={() => setTab("graphs")}
            >
              Graphs & data
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "activity"}
              className={`parent-analytics-page__tab ${tab === "activity" ? "parent-analytics-page__tab--active" : ""}`}
              onClick={() => setTab("activity")}
            >
              Activity list
            </button>
          </div>

          {error ? (
            <p className="parent-analytics-page__error" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="parent-analytics-page__muted">Loading analytics…</p>
          ) : tab === "activity" ? (
            <section
              className="dashboard-bento__card dashboard-bento__card--blue parent-analytics-page__activity-card"
              role="tabpanel"
              aria-label="Child activity list"
            >
              <h3>Child activity</h3>
              <p>Recent learning and class activity in the selected date range.</p>
              {activityRows.length === 0 ? (
                <p className="parent-analytics-page__muted">No activity found for this period.</p>
              ) : (
                <>
                  <ul className="parent-analytics-page__activity-list" role="list">
                    {pagedActivityRows.map((item, idx) => (
                      <li
                        key={`${item.kind}-${item.ref_id ?? item.occurred_at}-${idx}`}
                        className="parent-analytics-page__activity-row"
                        role="listitem"
                      >
                        <span className="parent-analytics-page__activity-main">
                          <strong>{item.title}</strong>
                          {item.detail ? (
                            <span className="parent-analytics-page__activity-detail">{item.detail}</span>
                          ) : null}
                        </span>
                        <span className="parent-analytics-page__activity-time">
                          {formatOccurredAt(item.occurred_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <nav className="parent-analytics-page__pager" aria-label="Activity pages">
                    <button
                      type="button"
                      className="parent-analytics-page__pager-btn"
                      disabled={activityCurrentPage <= 1}
                      onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="parent-analytics-page__pager-meta">
                      Page {activityCurrentPage} of {activityTotalPages} · {activityRows.length} items
                    </span>
                    <button
                      type="button"
                      className="parent-analytics-page__pager-btn"
                      disabled={activityCurrentPage >= activityTotalPages}
                      onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                    >
                      Next
                    </button>
                  </nav>
                </>
              )}
            </section>
          ) : (
            <>
              <section className="parent-analytics-page__kpis" aria-label="Key insights">
                <StatCard label="Lessons completed" value={stats.lessons} titleFirst />
                <StatCard label="Labs completed" value={stats.labs} titleFirst />
                <StatCard label="Assignments submitted" value={stats.submitted} titleFirst />
                <StatCard label="XP earned" value={stats.xp} titleFirst />
                <StatCard label="Attendance rate" value={`${stats.attendanceRate}%`} titleFirst />
                <StatCard label="Average grade" value={`${stats.avgGrade}/100`} titleFirst />
              </section>

              <section className="parent-analytics-page__charts">
                <article className="dashboard-bento__card dashboard-bento__card--blue parent-analytics-page__chart-card">
                  <h3>Progress over time</h3>
                  <p>Cumulative growth by period ({LOOKBACK_DAYS} days window by default).</p>
                  <div className="parent-analytics-page__bars">
                    {stats.bins.map((b, i) => (
                      <div key={`${b.label}-${i}`} className="parent-analytics-page__bar-col">
                        <div
                          className="parent-analytics-page__bar parent-analytics-page__bar--progress"
                          style={{ height: `${Math.max(6, Math.round((b.progress / maxProgress) * 100))}%` }}
                          title={`${b.label}: ${b.progress} progress events`}
                        />
                        <span>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="dashboard-bento__card dashboard-bento__card--green parent-analytics-page__chart-card">
                  <h3>Attendance over time</h3>
                  <p>Attendance quality by period (% present/late/excused among marked sessions).</p>
                  <div className="parent-analytics-page__bars">
                    {stats.bins.map((b, i) => (
                      <div key={`${b.label}-${i}`} className="parent-analytics-page__bar-col">
                        <div
                          className="parent-analytics-page__bar parent-analytics-page__bar--attendance"
                          style={{ height: `${Math.max(6, b.attendanceRate)}%` }}
                          title={`${b.label}: ${b.attendanceRate}% attendance`}
                        />
                        <span>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="dashboard-bento__card dashboard-bento__card--purple parent-analytics-page__insights">
                <h3>Insights</h3>
                <ul>
                  <li>
                    {activeChild ? childLabel(activeChild) : "Learner"} completed{" "}
                    <strong>{stats.lessons + stats.labs}</strong> learning modules in this period.
                  </li>
                  <li>
                    Attendance trend averages <strong>{stats.attendanceRate}%</strong>.{" "}
                    {stats.attendanceRate >= 90
                      ? "Great consistency."
                      : "Consider checking session-level attendance details for support opportunities."}
                  </li>
                  <li>
                    Assignment outcomes average <strong>{stats.avgGrade}/100</strong> across{" "}
                    <strong>{grades?.grades.length ?? 0}</strong> graded submissions.
                  </li>
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
