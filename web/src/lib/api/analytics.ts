import { apiFetch } from "./client";
import { getAccessToken } from "../tokens";

const TENANT_KEY = "tenant_id";

export type AnalyticsTotals = {
  enrolled_students: number;
  active_students: number;
  lesson_completions: number;
  lab_completions: number;
  lesson_progress_updates: number;
  lab_progress_updates: number;
  assignments_submitted: number;
  assignments_saved: number;
  assignments_on_time: number;
  assignments_late: number;
  assignments_graded: number;
  attendance_present: number;
  attendance_total: number;
  presence_records: number;
  median_assignment_score: number | null;
  mean_assignment_score: number | null;
  mean_rubric_compliance: number | null;
};

export type AnalyticsSummary = {
  tenant_id: string;
  dimension: string;
  dimension_key: string | null;
  date_from: string;
  date_to: string;
  totals: AnalyticsTotals;
  submission_rate: number | null;
  on_time_rate: number | null;
  attendance_rate: number | null;
  grading_rate: number | null;
  suppressed: boolean;
  last_computed_at: string | null;
  /** Max computed_at for this tenant across all rollup rows (any range). */
  rollup_last_completed_at: string | null;
};

export type AnalyticsBreakdownRow = {
  dimension_key: string;
  totals: AnalyticsTotals;
  submission_rate: number | null;
  on_time_rate: number | null;
  attendance_rate: number | null;
  grading_rate: number | null;
  suppressed: boolean;
};

export type AnalyticsBreakdown = {
  tenant_id: string;
  dimension: string;
  date_from: string;
  date_to: string;
  rows: AnalyticsBreakdownRow[];
  last_computed_at: string | null;
  rollup_last_completed_at: string | null;
};

function q(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchAnalyticsSummary(params: {
  dateFrom: Date;
  dateTo: Date;
  dimension?: string;
  dimensionKey?: string | null;
}): Promise<AnalyticsSummary> {
  const dim = params.dimension ?? "all";
  const search = new URLSearchParams({
    date_from: q(params.dateFrom),
    date_to: q(params.dateTo),
    dimension: dim,
  });
  if (params.dimensionKey) search.set("dimension_key", params.dimensionKey);
  return apiFetch<AnalyticsSummary>(`/analytics/summary?${search.toString()}`);
}

export async function fetchAnalyticsBreakdown(params: {
  dateFrom: Date;
  dateTo: Date;
  dimension: "program" | "course" | "classroom" | "instructor";
}): Promise<AnalyticsBreakdown> {
  const search = new URLSearchParams({
    date_from: q(params.dateFrom),
    date_to: q(params.dateTo),
    dimension: params.dimension,
  });
  return apiFetch<AnalyticsBreakdown>(`/analytics/breakdown?${search.toString()}`);
}

export type CompareDimension = "program" | "course" | "classroom" | "instructor";

export type DimensionLabelItem = { id: string; label: string };

export type DimensionLabelsResponse = {
  tenant_id: string;
  dimension: CompareDimension;
  items: DimensionLabelItem[];
};

export async function fetchDimensionLabels(dimension: CompareDimension): Promise<DimensionLabelsResponse> {
  const search = new URLSearchParams({ dimension });
  return apiFetch<DimensionLabelsResponse>(`/analytics/dimension-labels?${search.toString()}`);
}

export type AnalyticsCompareResult = {
  tenant_id: string;
  dimension: string;
  date_from: string;
  date_to: string;
  series: AnalyticsBreakdownRow[];
  last_computed_at: string | null;
  rollup_last_completed_at: string | null;
};

export type AnalyticsTimeseriesPoint = {
  bucket_date: string;
  active_students: number;
  lesson_completions: number;
  lab_completions: number;
  assignments_submitted: number;
  assignments_saved: number;
  assignments_graded: number;
  assignments_on_time: number;
  assignments_late: number;
  attendance_present: number;
  attendance_total: number;
  submission_rate: number | null;
  on_time_rate: number | null;
  attendance_rate: number | null;
  grading_rate: number | null;
  mean_assignment_score: number | null;
};

export type AnalyticsTimeseries = {
  tenant_id: string;
  date_from: string;
  date_to: string;
  points: AnalyticsTimeseriesPoint[];
  rollup_last_completed_at: string | null;
};

export async function fetchAnalyticsTimeseries(params: {
  dateFrom: Date;
  dateTo: Date;
}): Promise<AnalyticsTimeseries> {
  const search = new URLSearchParams({
    date_from: q(params.dateFrom),
    date_to: q(params.dateTo),
  });
  return apiFetch<AnalyticsTimeseries>(`/analytics/timeseries?${search.toString()}`);
}

export async function fetchAnalyticsCompare(params: {
  dateFrom: Date;
  dateTo: Date;
  dimension: CompareDimension;
  ids: string[];
}): Promise<AnalyticsCompareResult> {
  const search = new URLSearchParams({
    date_from: q(params.dateFrom),
    date_to: q(params.dateTo),
    dimension: params.dimension,
    ids: params.ids.join(","),
  });
  return apiFetch<AnalyticsCompareResult>(`/analytics/compare?${search.toString()}`);
}

export function analyticsExportPath(dateFrom: Date, dateTo: Date): string {
  const search = new URLSearchParams({
    date_from: q(dateFrom),
    date_to: q(dateTo),
  });
  return `/api/v1/analytics/export.csv?${search.toString()}`;
}

/** Enterprise + analytics:export; triggers browser download. */
export async function downloadAnalyticsExport(dateFrom: Date, dateTo: Date): Promise<void> {
  const token = getAccessToken()?.trim();
  const tenantId = typeof localStorage !== "undefined" ? localStorage.getItem(TENANT_KEY) : null;
  if (!token || !tenantId) throw new Error("Missing session or workspace");
  const path = analyticsExportPath(dateFrom, dateTo);
  const res = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tenant-ID": tenantId,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || "Export failed");
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tenant-analytics.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
