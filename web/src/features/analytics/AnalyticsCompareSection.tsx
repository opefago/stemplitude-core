import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAnalyticsCompare,
  fetchDimensionLabels,
  type AnalyticsCompareResult,
  type CompareDimension,
} from "../../lib/api/analytics";
import { KidCheckbox } from "../../components/ui/KidCheckbox";
import { KidDropdown } from "../../components/ui/KidDropdown";
import "../../components/ui/ui.css";

type Props = {
  dateFrom: Date;
  dateTo: Date;
  /** From summary API: last time any rollup row was written for this workspace. */
  workspaceRollupCompletedAt?: string | null;
};

const DIMENSION_OPTIONS: { value: CompareDimension; label: string }[] = [
  { value: "program", label: "Program" },
  { value: "course", label: "Curriculum (course)" },
  { value: "classroom", label: "Classroom" },
  { value: "instructor", label: "Instructor" },
];

function pct(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 1000) / 10}%`;
}

function num(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AnalyticsCompareSection({
  dateFrom,
  dateTo,
  workspaceRollupCompletedAt,
}: Props) {
  const [dimension, setDimension] = useState<CompareDimension>("program");
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<AnalyticsCompareResult | null>(null);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    setLoadingLabels(true);
    setErr(null);
    setSelected(new Set());
    setCompare(null);
    try {
      const res = await fetchDimensionLabels(dimension);
      const m: Record<string, string> = {};
      for (const it of res.items) m[it.id] = it.label;
      setLabelMap(m);
    } catch (e: unknown) {
      setLabelMap({});
      setErr(e instanceof Error ? e.message : "Could not load options");
    } finally {
      setLoadingLabels(false);
    }
  }, [dimension]);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  const sortedIds = useMemo(() => Object.keys(labelMap).sort((a, b) => (labelMap[a] || a).localeCompare(labelMap[b] || b)), [labelMap]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 4) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const runCompare = async () => {
    if (selected.size < 2) {
      setErr("Select at least two items to compare.");
      return;
    }
    setLoadingCompare(true);
    setErr(null);
    try {
      const res = await fetchAnalyticsCompare({
        dateFrom,
        dateTo,
        dimension,
        ids: Array.from(selected),
      });
      setCompare(res);
    } catch (e: unknown) {
      setCompare(null);
      setErr(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setLoadingCompare(false);
    }
  };

  const maxForBars = useMemo(() => {
    if (!compare?.series.length) return 100;
    let m = 1;
    for (const s of compare.series) {
      const t = s.totals;
      m = Math.max(m, t.lesson_completions, t.lab_completions, t.assignments_submitted, t.active_students);
    }
    return m;
  }, [compare]);

  return (
    <section className="tenant-analytics-compare" aria-labelledby="compare-heading">
      <h2 id="compare-heading">Compare outcomes</h2>
      <p className="tenant-analytics-page__compare-status">
        <strong>Last workspace analytics refresh:</strong>{" "}
        {workspaceRollupCompletedAt ? (
          <time dateTime={workspaceRollupCompletedAt}>
            {new Date(workspaceRollupCompletedAt).toLocaleString()}
          </time>
        ) : (
          <span className="tenant-analytics-page__muted">Not yet completed for this workspace.</span>
        )}
      </p>
      <p className="tenant-analytics-page__muted">
        Pick up to four {DIMENSION_OPTIONS.find((d) => d.value === dimension)?.label.toLowerCase() ?? "entities"} and
        contrast submissions, grading, lesson/lab progress, and attendance. Range: {isoDate(dateFrom)} → {isoDate(dateTo)}{" "}
        (UTC), matching the overview.
      </p>

      <div className="tenant-analytics-compare__controls">
        <div className="tenant-analytics-compare__field">
          <span className="tenant-analytics-compare__field-label">Compare by</span>
          <KidDropdown
            ariaLabel="Compare by dimension"
            value={dimension}
            options={DIMENSION_OPTIONS}
            onChange={(v) => setDimension(v as CompareDimension)}
            minWidth={240}
          />
        </div>
        <button
          type="button"
          className="kid-button"
          onClick={() => void runCompare()}
          disabled={loadingCompare || selected.size < 2}
        >
          {loadingCompare ? "Comparing…" : "Run comparison"}
        </button>
      </div>

      {err ? <p className="tenant-analytics-page__error">{err}</p> : null}

      {loadingLabels ? (
        <p className="tenant-analytics-page__muted">Loading options…</p>
      ) : sortedIds.length === 0 ? (
        <p className="tenant-analytics-page__muted">No items found for this dimension. Link programs, courses, or instructors to classrooms first.</p>
      ) : (
        <div className="tenant-analytics-compare__picker">
          <p className="tenant-analytics-compare__picker-hint">Select 2–4 ({selected.size} selected)</p>
          <ul className="tenant-analytics-compare__checkbox-list">
            {sortedIds.map((id) => (
              <li key={id}>
                <KidCheckbox
                  className="tenant-analytics-compare__kid-check"
                  checked={selected.has(id)}
                  disabled={!selected.has(id) && selected.size >= 4}
                  onChange={() => toggle(id)}
                  compact
                >
                  <span className="tenant-analytics-compare__check-text">
                    <span className="tenant-analytics-compare__check-name">{labelMap[id] ?? id}</span>
                    <span className="tenant-analytics-compare__id">{id.slice(0, 8)}…</span>
                  </span>
                </KidCheckbox>
              </li>
            ))}
          </ul>
        </div>
      )}

      {compare && compare.series.length > 0 ? (
        <>
          <div className="tenant-analytics-compare__bars" aria-label="Relative scale chart">
            {compare.series.map((s) => (
              <div key={s.dimension_key} className="tenant-analytics-compare__bar-col">
                <div className="tenant-analytics-compare__bar-title">{labelMap[s.dimension_key] ?? s.dimension_key}</div>
                <div className="tenant-analytics-compare__bar-stack">
                  <div
                    className="tenant-analytics-compare__bar tenant-analytics-compare__bar--lessons"
                    style={{ height: `${Math.max(10, (s.totals.lesson_completions / maxForBars) * 100)}%` }}
                    title={`Lessons: ${s.totals.lesson_completions}`}
                  />
                  <div
                    className="tenant-analytics-compare__bar tenant-analytics-compare__bar--labs"
                    style={{ height: `${Math.max(10, (s.totals.lab_completions / maxForBars) * 100)}%` }}
                    title={`Labs: ${s.totals.lab_completions}`}
                  />
                  <div
                    className="tenant-analytics-compare__bar tenant-analytics-compare__bar--submit"
                    style={{ height: `${Math.max(10, (s.totals.assignments_submitted / maxForBars) * 100)}%` }}
                    title={`Submitted: ${s.totals.assignments_submitted}`}
                  />
                </div>
                <div className="tenant-analytics-compare__bar-legend">
                  <span>L</span>
                  <span>B</span>
                  <span>S</span>
                </div>
              </div>
            ))}
          </div>
          <p className="tenant-analytics-compare__bar-note">Bars: lesson completions (L), lab completions (B), assignments submitted (S) — scaled to the max in this set.</p>

          <div className="tenant-analytics-compare__table-wrap">
            <table className="tenant-analytics-page__table tenant-analytics-compare__table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {compare.series.map((s) => (
                    <th key={s.dimension_key}>{labelMap[s.dimension_key] ?? s.dimension_key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Enrolled</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : s.totals.enrolled_students}</td>
                  ))}
                </tr>
                <tr>
                  <td>Active learners</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : s.totals.active_students}</td>
                  ))}
                </tr>
                <tr>
                  <td>Submissions</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : s.totals.assignments_submitted}</td>
                  ))}
                </tr>
                <tr>
                  <td>Submit rate</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : pct(s.submission_rate)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Graded / grading rate</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>
                      {s.suppressed
                        ? "—"
                        : `${s.totals.assignments_graded} (${pct(s.grading_rate)})`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Mean assignment score (0–100)</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : num(s.totals.mean_assignment_score)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Rubric compliance (avg)</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : pct(s.totals.mean_rubric_compliance)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Lesson completions</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : s.totals.lesson_completions}</td>
                  ))}
                </tr>
                <tr>
                  <td>Lab completions</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : s.totals.lab_completions}</td>
                  ))}
                </tr>
                <tr>
                  <td>Attendance rate</td>
                  {compare.series.map((s) => (
                    <td key={s.dimension_key}>{s.suppressed ? "—" : pct(s.attendance_rate)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
