import { useId, useMemo } from "react";
import type {
  AnalyticsBreakdown,
  AnalyticsSummary,
  AnalyticsTimeseries,
} from "../../lib/api/analytics";

function pct(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 1000) / 10}%`;
}

function rateToPercentPoints(r: number | null | undefined): number {
  if (r == null || Number.isNaN(r)) return 0;
  return Math.min(100, Math.max(0, r * 100));
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SparklineChart({
  title,
  hint,
  dates,
  values,
  stroke,
  valueFormatter,
  yMin,
  yMax,
}: {
  title: string;
  hint?: string;
  dates: string[];
  values: number[];
  stroke: string;
  valueFormatter: (n: number) => string;
  yMin?: number;
  yMax?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const W = 360;
  const H = 108;
  const padX = 8;
  const padY = 10;
  const innerW = W - 2 * padX;
  const innerH = H - 2 * padY;
  const n = values.length;

  if (n === 0) {
    return (
      <div className="tenant-analytics-insights__chart-card">
        <h3 className="tenant-analytics-insights__chart-title">{title}</h3>
        {hint ? <p className="tenant-analytics-insights__chart-hint">{hint}</p> : null}
        <p className="tenant-analytics-page__muted tenant-analytics-insights__chart-empty">
          No daily data in this range yet. After nightly rollups run, you will see day-by-day movement here.
        </p>
      </div>
    );
  }

  const minV = yMin ?? Math.min(0, ...values);
  const maxV = yMax ?? Math.max(minV + 1e-6, ...values);
  const span = maxV - minV || 1;

  const pts = values.map((v, i) => {
    const x = padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padY + innerH - ((v - minV) / span) * innerH;
    return { x, y, v };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length - 1]?.x ?? 0} ${padY + innerH} L ${pts[0]?.x ?? 0} ${padY + innerH} Z`;

  const last = pts[pts.length - 1];
  const firstLabel = shortDate(dates[0] ?? "");
  const lastLabel = shortDate(dates[dates.length - 1] ?? "");

  const aria = `${title} from ${firstLabel} to ${lastLabel}. Latest value ${valueFormatter(last?.v ?? 0)}.`;

  return (
    <div className="tenant-analytics-insights__chart-card">
      <div className="tenant-analytics-insights__chart-head">
        <h3 className="tenant-analytics-insights__chart-title">{title}</h3>
        <span className="tenant-analytics-insights__chart-latest" style={{ color: stroke }}>
          {valueFormatter(last?.v ?? 0)}
        </span>
      </div>
      {hint ? <p className="tenant-analytics-insights__chart-hint">{hint}</p> : null}
      <svg
        className="tenant-analytics-insights__sparkline"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={aria}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#fill-${gid})`} />
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {n === 1 ? <circle cx={pts[0].x} cy={pts[0].y} r="4" fill={stroke} /> : null}
      </svg>
      <div className="tenant-analytics-insights__chart-axis">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  max,
  color,
  meta,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  meta?: string;
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="tenant-analytics-insights__hbar">
      <div className="tenant-analytics-insights__hbar-label">
        <span>{label}</span>
        <span className="tenant-analytics-insights__hbar-value">{value}</span>
      </div>
      {meta ? <div className="tenant-analytics-insights__hbar-meta tenant-analytics-page__muted">{meta}</div> : null}
      <div className="tenant-analytics-insights__hbar-track">
        <div className="tenant-analytics-insights__hbar-fill" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

export function AdminInsightsPanel({
  summary,
  timeseries,
  programs,
  programLabels,
}: {
  summary: AnalyticsSummary;
  timeseries: AnalyticsTimeseries | null;
  programs: AnalyticsBreakdown | null;
  programLabels: Record<string, string>;
}) {
  const points = timeseries?.points ?? [];
  const dates = useMemo(() => points.map((p) => p.bucket_date), [points]);

  const activeSeries = useMemo(() => points.map((p) => p.active_students), [points]);
  const submitSeries = useMemo(() => points.map((p) => p.assignments_submitted), [points]);
  const gradeRateSeries = useMemo(() => points.map((p) => rateToPercentPoints(p.grading_rate)), [points]);
  const attRateSeries = useMemo(() => points.map((p) => rateToPercentPoints(p.attendance_rate)), [points]);

  const t = summary.totals;
  const pipelineMax = Math.max(t.assignments_saved, t.assignments_submitted, t.assignments_graded, 1);
  const timedTotal = t.assignments_on_time + t.assignments_late;
  const onTimePct = timedTotal > 0 ? (t.assignments_on_time / timedTotal) * 100 : 0;
  const latePct = timedTotal > 0 ? (t.assignments_late / timedTotal) * 100 : 0;
  const contentTotal = t.lesson_completions + t.lab_completions;
  const lessonPct = contentTotal > 0 ? (t.lesson_completions / contentTotal) * 100 : 50;
  const labPct = contentTotal > 0 ? (t.lab_completions / contentTotal) * 100 : 50;

  const programBars = useMemo(() => {
    if (!programs?.rows.length) return [];
    const rows = programs.rows
      .filter((r) => !r.suppressed)
      .map((r) => ({
        key: r.dimension_key,
        label: programLabels[r.dimension_key] ?? `${r.dimension_key.slice(0, 8)}…`,
        active: r.totals.active_students,
        submitRate: r.submission_rate,
      }))
      .sort((a, b) => b.active - a.active)
      .slice(0, 8);
    const maxA = Math.max(1, ...rows.map((r) => r.active));
    return rows.map((r) => ({ ...r, maxA }));
  }, [programs, programLabels]);

  const primary = "var(--color-primary, #58cc02)";
  const blue = "#2563eb";
  const violet = "#8b5cf6";
  const amber = "#d97706";

  return (
    <section className="tenant-analytics-insights" aria-labelledby="admin-insights-heading">
      <h2 id="admin-insights-heading" className="tenant-analytics-insights__section-title">
        Practical insights
      </h2>
      <p className="tenant-analytics-insights__lede tenant-analytics-page__muted">
        Trends use daily workspace rollups. Operational bars summarize the full selected range so you can spot bottlenecks
        and compare programs.
      </p>

      <div className="tenant-analytics-insights__subsection">
        <h3 className="tenant-analytics-insights__h3">Daily trends</h3>
        <p className="tenant-analytics-insights__microcopy tenant-analytics-page__muted">
          Steady or rising lines usually mean healthy rhythm; sharp drops often match holidays, schedule changes, or rollup
          gaps. Rate charts are 0–100% and may read 0% on days with no submissions or attendance marks.
        </p>
        <div className="tenant-analytics-insights__chart-grid">
          <SparklineChart
            title="Active learners / day"
            hint="Students with recorded activity that UTC day (tenant-wide)."
            dates={dates}
            values={activeSeries}
            stroke={primary}
            valueFormatter={(n) => `${Math.round(n)}`}
          />
          <SparklineChart
            title="Assignments submitted / day"
            hint="Turned-in work counted on the day it was submitted."
            dates={dates}
            values={submitSeries}
            stroke={blue}
            valueFormatter={(n) => `${Math.round(n)}`}
          />
          <SparklineChart
            title="Grading rate / day"
            hint="Graded ÷ submitted that day."
            dates={dates}
            values={gradeRateSeries}
            stroke={violet}
            valueFormatter={(n) => `${Math.round(n)}%`}
            yMin={0}
            yMax={100}
          />
          <SparklineChart
            title="Attendance rate / day"
            hint="Present ÷ attendance marks that day."
            dates={dates}
            values={attRateSeries}
            stroke={amber}
            valueFormatter={(n) => `${Math.round(n)}%`}
            yMin={0}
            yMax={100}
          />
        </div>
      </div>

      <div className="tenant-analytics-insights__subsection">
        <h3 className="tenant-analytics-insights__h3">Operational focus (selected range)</h3>
        <div className="tenant-analytics-insights__ops-grid">
          <div className="tenant-analytics-insights__ops-card">
            <h4 className="tenant-analytics-insights__h4">Assignment pipeline</h4>
            <p className="tenant-analytics-insights__microcopy tenant-analytics-page__muted">
              Drafts saved vs submitted vs graded. A large “saved” bar with a small “submitted” bar suggests learners are
              starting but not finishing—check due dates, reminders, and rubric clarity.
            </p>
            <HorizontalBar label="Saved (drafts)" value={t.assignments_saved} max={pipelineMax} color={blue} />
            <HorizontalBar label="Submitted" value={t.assignments_submitted} max={pipelineMax} color={primary} />
            <HorizontalBar label="Graded" value={t.assignments_graded} max={pipelineMax} color={violet} />
          </div>

          <div className="tenant-analytics-insights__ops-card">
            <h4 className="tenant-analytics-insights__h4">Submission timeliness</h4>
            <p className="tenant-analytics-insights__microcopy tenant-analytics-page__muted">
              Among work with on-time vs late classification. Improve pacing by aligning due dates with class sessions.
            </p>
            {timedTotal > 0 ? (
              <div className="tenant-analytics-insights__stacked" role="img" aria-label={`On-time ${pct(summary.on_time_rate)}`}>
                <div
                  className="tenant-analytics-insights__stacked-seg tenant-analytics-insights__stacked-seg--on-time"
                  style={{ width: `${onTimePct}%` }}
                  title={`On-time: ${t.assignments_on_time}`}
                />
                <div
                  className="tenant-analytics-insights__stacked-seg tenant-analytics-insights__stacked-seg--late"
                  style={{ width: `${latePct}%` }}
                  title={`Late: ${t.assignments_late}`}
                />
              </div>
            ) : (
              <p className="tenant-analytics-page__muted">No on-time / late breakdown in this range.</p>
            )}
            <ul className="tenant-analytics-insights__legend">
              <li>
                <span className="tenant-analytics-insights__swatch tenant-analytics-insights__swatch--on-time" /> On-time{" "}
                {t.assignments_on_time} ({pct(summary.on_time_rate)})
              </li>
              <li>
                <span className="tenant-analytics-insights__swatch tenant-analytics-insights__swatch--late" /> Late{" "}
                {t.assignments_late}
              </li>
            </ul>
          </div>

          <div className="tenant-analytics-insights__ops-card">
            <h4 className="tenant-analytics-insights__h4">Lesson vs lab completions</h4>
            <p className="tenant-analytics-insights__microcopy tenant-analytics-page__muted">
              Balance instructional vs hands-on volume. A skew may mean it is time to add labs or shorten lesson blocks.
            </p>
            {contentTotal > 0 ? (
              <>
                <div className="tenant-analytics-insights__stacked" role="img" aria-label="Lesson and lab mix">
                  <div
                    className="tenant-analytics-insights__stacked-seg tenant-analytics-insights__stacked-seg--lesson"
                    style={{ width: `${lessonPct}%` }}
                    title={`Lessons: ${t.lesson_completions}`}
                  />
                  <div
                    className="tenant-analytics-insights__stacked-seg tenant-analytics-insights__stacked-seg--lab"
                    style={{ width: `${labPct}%` }}
                    title={`Labs: ${t.lab_completions}`}
                  />
                </div>
                <ul className="tenant-analytics-insights__legend">
                  <li>
                    <span className="tenant-analytics-insights__swatch tenant-analytics-insights__swatch--lesson" /> Lessons{" "}
                    {t.lesson_completions}
                  </li>
                  <li>
                    <span className="tenant-analytics-insights__swatch tenant-analytics-insights__swatch--lab" /> Labs{" "}
                    {t.lab_completions}
                  </li>
                </ul>
              </>
            ) : (
              <p className="tenant-analytics-page__muted">No lesson or lab completions in this range.</p>
            )}
          </div>
        </div>
      </div>

      {programBars.length > 0 ? (
        <div className="tenant-analytics-insights__subsection">
          <h3 className="tenant-analytics-insights__h3">Programs by active learners</h3>
          <p className="tenant-analytics-insights__microcopy tenant-analytics-page__muted">
            Top programs in this range by active learners (cohorts under five enrolled are hidden). Submit rate is for the
            same window.
          </p>
          <div className="tenant-analytics-insights__ops-card tenant-analytics-insights__ops-card--flush">
            {programBars.map((r) => (
              <div key={r.key} className="tenant-analytics-insights__program-row">
                <HorizontalBar
                  label={r.label}
                  value={r.active}
                  max={r.maxA}
                  color={primary}
                  meta={`Submit rate ${pct(r.submitRate)}`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
