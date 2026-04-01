import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  fetchAnalyticsBreakdown,
  fetchAnalyticsSummary,
  fetchAnalyticsTimeseries,
  fetchDimensionLabels,
  downloadAnalyticsExport,
  type AnalyticsBreakdown,
  type AnalyticsSummary,
  type AnalyticsTimeseries,
} from "../../lib/api/analytics";
import { apiFetch } from "../../lib/api/client";
import { StatCard } from "../../components/ui/StatCard";
import "../../components/ui/ui.css";
import { AdminInsightsPanel } from "./AdminInsightsPanel";
import { AnalyticsCompareSection } from "./AnalyticsCompareSection";
import "./analytics-page.css";

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pct(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 1000) / 10}%`;
}

function num(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

export function TenantAnalyticsPage() {
  const { role } = useAuth();
  const [rangeDays] = useState(30);
  const dateTo = useMemo(() => new Date(), []);
  const dateFrom = useMemo(() => addDays(dateTo, -rangeDays), [dateTo, rangeDays]);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [programs, setPrograms] = useState<AnalyticsBreakdown | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseries | null>(null);
  const [programLabelMap, setProgramLabelMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "compare">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cap = await apiFetch<{ allowed: boolean; reason?: string | null }>(
        "/capabilities/check",
        { method: "POST", body: { capability_key: "view_analytics" } },
      );
      setAllowed(cap.allowed);
      if (!cap.allowed) {
        setSummary(null);
        setPrograms(null);
        setTimeseries(null);
        setProgramLabelMap({});
        return;
      }
      const [sum, br, ts, labelRes] = await Promise.all([
        fetchAnalyticsSummary({ dateFrom, dateTo, dimension: "all" }),
        fetchAnalyticsBreakdown({
          dateFrom,
          dateTo,
          dimension: "program",
        }).catch(() => null),
        fetchAnalyticsTimeseries({ dateFrom, dateTo }).catch(() => null),
        fetchDimensionLabels("program").catch(() => ({ items: [] as { id: string; label: string }[] })),
      ]);
      setSummary(sum);
      setPrograms(br);
      setTimeseries(ts);
      setProgramLabelMap(Object.fromEntries(labelRes.items.map((it) => [it.id, it.label])));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load analytics");
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = async () => {
    setExportBusy(true);
    setError(null);
    try {
      await downloadAnalyticsExport(dateFrom, dateTo);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="tenant-analytics-page">
      <header className="tenant-analytics-page__header">
        <Link to="/app" className="tenant-analytics-page__back">
          <ArrowLeft size={18} aria-hidden />
          Dashboard
        </Link>
        <div className="tenant-analytics-page__title-block">
          <h1 className="tenant-analytics-page__title">Organization insights</h1>
          <p className="tenant-analytics-page__subtitle">
            Learning activity, assignments, and attendance — Pro and Enterprise plans. Rollups run nightly (~04:15 UTC)
            when Celery Beat is running; the status below shows when this workspace last finished updating.
          </p>
        </div>
        {role === "owner" ? (
          <button
            type="button"
            className="kid-button kid-button--ghost"
            onClick={() => void onExport()}
            disabled={exportBusy || !allowed}
          >
            <Download size={16} aria-hidden />
            {exportBusy ? "Exporting…" : "Export CSV"}
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="tenant-analytics-page__muted">Loading…</p>
      ) : null}
      {error ? <p className="tenant-analytics-page__error">{error}</p> : null}

      {allowed === false ? (
        <section className="tenant-analytics-page__upgrade" aria-labelledby="analytics-upgrade-heading">
          <h2 id="analytics-upgrade-heading">Upgrade to unlock insights</h2>
          <p>
            Advanced analytics are included with <strong>Pro</strong> and <strong>Enterprise</strong> center plans.
            Owners and admins need the analytics role permission (added automatically for new workspaces).
          </p>
          <Link to="/app/billing" className="kid-button">
            View plans
          </Link>
        </section>
      ) : null}

      {summary && allowed ? (
        <>
          <nav className="tenant-analytics-page__tabs" aria-label="Insights sections">
            <button
              type="button"
              className={tab === "overview" ? "is-active" : ""}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={tab === "compare" ? "is-active" : ""}
              onClick={() => setTab("compare")}
            >
              Compare
            </button>
          </nav>

          {tab === "compare" ? (
            <AnalyticsCompareSection
              dateFrom={dateFrom}
              dateTo={dateTo}
              workspaceRollupCompletedAt={summary.rollup_last_completed_at}
            />
          ) : null}

          {tab === "overview" ? (
            <>
          <section className="tenant-analytics-page__meta" aria-live="polite">
            <div className="tenant-analytics-page__meta-block">
              <strong>Last workspace analytics refresh</strong>
              {summary.rollup_last_completed_at ? (
                <time dateTime={summary.rollup_last_completed_at}>
                  {new Date(summary.rollup_last_completed_at).toLocaleString()}
                </time>
              ) : (
                <span className="tenant-analytics-page__muted">
                  Not yet. Start a Celery worker and Beat for this deployment, or run a manual rebuild; nightly
                  rollups run around 04:15 UTC when Beat is enabled.
                </span>
              )}
            </div>
            <div className="tenant-analytics-page__meta-block tenant-analytics-page__meta-block--secondary">
              <span>
                Selected range: {summary.date_from} → {summary.date_to} (UTC)
              </span>
              {summary.last_computed_at ? (
                <span>
                  Newest rollup in this range:{" "}
                  <time dateTime={summary.last_computed_at}>
                    {new Date(summary.last_computed_at).toLocaleString()}
                  </time>
                </span>
              ) : (
                <span className="tenant-analytics-page__muted">
                  No rollup rows in this date range (metrics may be empty).
                </span>
              )}
            </div>
          </section>

          <AdminInsightsPanel
            summary={summary}
            timeseries={timeseries}
            programs={programs}
            programLabels={programLabelMap}
          />

          <section className="tenant-analytics-page__grid" aria-label="Summary totals">
            <StatCard
              titleFirst
              label="Active learners"
              value={summary.totals.active_students}
              hint="Distinct students with activity in range"
            />
            <StatCard titleFirst label="Lesson completions" value={summary.totals.lesson_completions} />
            <StatCard titleFirst label="Lab completions" value={summary.totals.lab_completions} />
            <StatCard
              titleFirst
              label="Assignments submitted"
              value={summary.totals.assignments_submitted}
              hint={`Submission rate ${pct(summary.submission_rate)}`}
            />
            <StatCard
              titleFirst
              label="On-time submissions"
              value={pct(summary.on_time_rate)}
              hint="Of submitted before session end"
            />
            <StatCard
              titleFirst
              label="Attendance"
              value={pct(summary.attendance_rate)}
              hint={`Present / recorded marks (${summary.totals.attendance_present} / ${summary.totals.attendance_total})`}
            />
            <StatCard
              titleFirst
              label="Graded submissions"
              value={summary.totals.assignments_graded ?? 0}
              hint={`Grading rate ${pct(summary.grading_rate)}`}
            />
            <StatCard
              titleFirst
              label="Mean assignment score"
              value={num(summary.totals.mean_assignment_score)}
              hint="0–100 when scores exist"
            />
            <StatCard
              titleFirst
              label="Rubric compliance"
              value={pct(summary.totals.mean_rubric_compliance)}
              hint="Avg points earned vs rubric max, when rubrics used"
            />
          </section>

          {programs && programs.rows.length > 0 ? (
            <section className="tenant-analytics-page__table-section" aria-labelledby="prog-breakdown">
              <h2 id="prog-breakdown">By program</h2>
              <p className="tenant-analytics-page__muted">
                Rows with fewer than five enrolled learners are flagged for privacy.
              </p>
              <div className="tenant-analytics-page__table-wrap">
                <table className="tenant-analytics-page__table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Enrolled</th>
                      <th>Active</th>
                      <th>Lessons done</th>
                      <th>Labs done</th>
                      <th>Submitted</th>
                      <th>Submit rate</th>
                      <th>Graded</th>
                      <th>Grading rate</th>
                      <th>Mean score</th>
                      <th>Rubric</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.rows.map((row) => (
                      <tr key={row.dimension_key} className={row.suppressed ? "is-suppressed" : ""}>
                        <td title={row.dimension_key}>
                          {programLabelMap[row.dimension_key] ?? row.dimension_key}
                        </td>
                        <td>{row.suppressed ? "—" : row.totals.enrolled_students}</td>
                        <td>{row.suppressed ? "—" : row.totals.active_students}</td>
                        <td>{row.suppressed ? "—" : row.totals.lesson_completions}</td>
                        <td>{row.suppressed ? "—" : row.totals.lab_completions}</td>
                        <td>{row.suppressed ? "—" : row.totals.assignments_submitted}</td>
                        <td>{row.suppressed ? "—" : pct(row.submission_rate)}</td>
                        <td>{row.suppressed ? "—" : row.totals.assignments_graded ?? 0}</td>
                        <td>{row.suppressed ? "—" : pct(row.grading_rate)}</td>
                        <td>{row.suppressed ? "—" : num(row.totals.mean_assignment_score)}</td>
                        <td>{row.suppressed ? "—" : pct(row.totals.mean_rubric_compliance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
