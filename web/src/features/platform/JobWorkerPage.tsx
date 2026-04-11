import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  FileText,
  Loader2,
  RotateCcw,
  Settings,
} from "lucide-react";
import {
  getJobTypes,
  getJobStats,
  getRecentJobResults,
  retryJob,
  cancelJob,
  type JobType,
  type JobStats,
  type TaskResult,
  type ActiveTask,
} from "../../lib/api/platform";
import "./job-worker.css";

type TabId = "running" | "failed" | "archived" | "types";

function shortUuid(uuid: string): string {
  return uuid.length >= 8 ? uuid.slice(0, 8) : uuid;
}

function taskResultTitle(r: TaskResult): string {
  return (
    r.display_name?.trim() ||
    r.job_type ||
    r.task_name ||
    r.task_id
  );
}

function runningTaskTitle(task: ActiveTask): string {
  return task.display_name?.trim() || task.name || "Running task";
}

function formatTimestamp(iso: string | number | null): string {
  if (iso == null) return "—";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function TaskExpandedPanels({ r }: { r: TaskResult }) {
  const d = r.details;
  const hasMeta = d != null && Object.keys(d).length > 0;
  const resultEmpty = r.result === undefined || r.result === null;

  return (
    <div className="job-worker__logs-panel">
      <h4 className="job-worker__logs-title">Return value</h4>
      <pre className="job-worker__result-json">
        {resultEmpty
          ? "null"
          : typeof r.result === "string"
            ? r.result
            : JSON.stringify(r.result, null, 2)}
      </pre>
      {hasMeta && (
        <>
          <h4 className="job-worker__logs-title">Execution metadata</h4>
          <pre className="job-worker__result-json">{JSON.stringify(d, null, 2)}</pre>
        </>
      )}
      {!hasMeta && resultEmpty && (
        <p className="job-worker__detail-hint">
          No task return value or extended metadata in Redis. For parameters (recipient, subject,
          etc.), workers must persist extended results — see{" "}
          <code>result_extended</code> in <code>workers/celery_app.py</code>. New{" "}
          <code>email.send</code> tasks return a JSON summary with <code>recipient</code> and{" "}
          <code>outcome</code>.
        </p>
      )}
    </div>
  );
}

export function JobWorkerPage() {
  const [tab, setTab] = useState<TabId>("running");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [recentResults, setRecentResults] = useState<TaskResult[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, stats, resultsRes] = await Promise.all([
        getJobTypes(),
        getJobStats(),
        getRecentJobResults(),
      ]);
      setJobTypes(typesRes.job_types);
      setJobStats(stats);
      setRecentResults(resultsRes.results);
    } catch (err) {
      console.error("Failed to fetch job data:", err);
      setJobStats(null);
      setRecentResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatsAndResults = useCallback(async () => {
    try {
      const [stats, resultsRes] = await Promise.all([
        getJobStats(),
        getRecentJobResults(),
      ]);
      setJobStats(stats);
      setRecentResults(resultsRes.results);
    } catch (err) {
      console.error("Failed to refresh job data:", err);
    }
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatsAndResults, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatsAndResults]);

  const handleRetry = useCallback(
    async (taskId: string) => {
      setActionFeedback(null);
      setActionLoading(taskId);
      try {
        const res = await retryJob(taskId);
        await fetchStatsAndResults();
        const extra = res.task_id
          ? ` New task id: ${shortUuid(res.task_id)}.`
          : "";
        setActionFeedback({
          type: "ok",
          text: (res.message ?? "Job re-queued.") + extra,
        });
      } catch (err) {
        const text =
          err instanceof Error ? err.message : "Retry failed. Check API logs.";
        setActionFeedback({ type: "err", text });
      } finally {
        setActionLoading(null);
      }
    },
    [fetchStatsAndResults]
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      setActionFeedback(null);
      setActionLoading(taskId);
      try {
        const res = await cancelJob(taskId);
        await fetchStatsAndResults();
        if (res.success) {
          setActionFeedback({
            type: "ok",
            text: res.message ?? "Cancellation requested.",
          });
        } else {
          setActionFeedback({
            type: "err",
            text: res.error ?? "Cancel failed.",
          });
        }
      } catch (err) {
        const text =
          err instanceof Error ? err.message : "Cancel failed.";
        setActionFeedback({ type: "err", text });
      } finally {
        setActionLoading(null);
      }
    },
    [fetchStatsAndResults]
  );

  const failedResults = recentResults.filter((r) => r.status === "FAILURE");
  const archivedResults = recentResults.filter((r) => r.status === "SUCCESS");
  const activeTasks = jobStats?.active_tasks ?? [];
  const runningCount = jobStats?.running_count ?? 0;
  const workersCount = jobStats?.workers?.length ?? 0;

  return (
    <div className="job-worker" role="main" aria-label="Job Worker monitoring">
      <header className="job-worker__header">
        <div className="job-worker__header-inner">
          <Activity size={32} className="job-worker__header-icon" aria-hidden />
          <div>
            <h1 className="job-worker__title">Job Worker</h1>
            <p className="job-worker__subtitle">
              Monitor background jobs for super admins
            </p>
          </div>
        </div>
      </header>

      {jobStats && !jobStats.available && (
        <div
          className="job-worker__banner job-worker__banner--warning"
          role="alert"
        >
          <AlertTriangle size={20} aria-hidden />
          <span>
            {jobStats.message?.trim()
              ? jobStats.message
              : "Celery is not available (broker unreachable or no workers). Background tasks will not run until a worker is online."}
          </span>
        </div>
      )}

      {/* Stats Bar */}
      <section className="job-worker__stats" aria-label="Job statistics">
        <div className="job-worker__stat-card job-worker__stat-card--running">
          <Loader2
            size={22}
            className="job-worker__stat-icon job-worker__stat-icon--spin"
            aria-hidden
          />
          <div>
            <span className="job-worker__stat-value">{runningCount}</span>
            <span className="job-worker__stat-label">Running</span>
          </div>
        </div>
        <div className="job-worker__stat-card job-worker__stat-card--failed">
          <XCircle size={22} className="job-worker__stat-icon" aria-hidden />
          <div>
            <span className="job-worker__stat-value">{failedResults.length}</span>
            <span className="job-worker__stat-label">Failed</span>
          </div>
        </div>
        <div className="job-worker__stat-card job-worker__stat-card--completed">
          <CheckCircle2 size={22} className="job-worker__stat-icon" aria-hidden />
          <div>
            <span className="job-worker__stat-value">{archivedResults.length}</span>
            <span className="job-worker__stat-label">Completed</span>
          </div>
        </div>
        <div className="job-worker__stat-card">
          <Activity size={22} className="job-worker__stat-icon" aria-hidden />
          <div>
            <span className="job-worker__stat-value">{workersCount}</span>
            <span className="job-worker__stat-label">Workers</span>
          </div>
        </div>
        <div className="job-worker__stat-card job-worker__stat-card--toggle">
          <label className="job-worker__toggle-wrap">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="job-worker__toggle-input"
              aria-label="Auto-refresh every 5 seconds"
            />
            <span className="job-worker__toggle-track">
              <span className="job-worker__toggle-thumb" />
            </span>
            <span className="job-worker__toggle-label">
              {autoRefresh ? (
                <>
                  <RefreshCw size={14} className="job-worker__toggle-icon" />
                  Auto-refresh ON
                </>
              ) : (
                <>
                  <Play size={14} className="job-worker__toggle-icon" />
                  Auto-refresh OFF
                </>
              )}
            </span>
          </label>
        </div>
      </section>

      {/* Tab Navigation */}
      <nav className="job-worker__tabs" aria-label="Job status tabs">
        <button
          type="button"
          className={`job-worker__tab ${tab === "running" ? "job-worker__tab--active" : ""}`}
          onClick={() => setTab("running")}
          aria-selected={tab === "running"}
          aria-controls="job-worker-panel"
        >
          <Loader2 size={18} className="job-worker__tab-icon" />
          Running
          <span className="job-worker__tab-count">{activeTasks.length}</span>
        </button>
        <button
          type="button"
          className={`job-worker__tab ${tab === "failed" ? "job-worker__tab--active" : ""}`}
          onClick={() => setTab("failed")}
          aria-selected={tab === "failed"}
          aria-controls="job-worker-panel"
        >
          <XCircle size={18} className="job-worker__tab-icon" />
          Failed
          <span className="job-worker__tab-count">{failedResults.length}</span>
        </button>
        <button
          type="button"
          className={`job-worker__tab ${tab === "archived" ? "job-worker__tab--active" : ""}`}
          onClick={() => setTab("archived")}
          aria-selected={tab === "archived"}
          aria-controls="job-worker-panel"
        >
          <CheckCircle2 size={18} className="job-worker__tab-icon" />
          Archived
          <span className="job-worker__tab-count">{archivedResults.length}</span>
        </button>
        <button
          type="button"
          className={`job-worker__tab ${tab === "types" ? "job-worker__tab--active" : ""}`}
          onClick={() => setTab("types")}
          aria-selected={tab === "types"}
          aria-controls="job-worker-panel"
        >
          <Settings size={18} className="job-worker__tab-icon" />
          Job Types
          <span className="job-worker__tab-count">{jobTypes.length}</span>
        </button>
      </nav>

      {/* Content */}
      <div className="job-worker__content">
        <section
          id="job-worker-panel"
          className="job-worker__panel"
          aria-label="Job list"
        >
          {actionFeedback && !loading && (
            <div
              role="alert"
              className={`job-worker__banner job-worker__banner--action job-worker__banner--${actionFeedback.type === "ok" ? "success" : "error"}`}
            >
              <span className="job-worker__banner-text">{actionFeedback.text}</span>
              <button
                type="button"
                className="job-worker__banner-dismiss"
                onClick={() => setActionFeedback(null)}
              >
                Dismiss
              </button>
            </div>
          )}
          {loading ? (
            <div className="job-worker__empty">
              <Loader2
                size={48}
                className="job-worker__empty-icon job-worker__stat-icon--spin"
                aria-hidden
              />
              <p className="job-worker__empty-text">Loading job data…</p>
            </div>
          ) : tab === "types" ? (
            <JobTypesGrid jobTypes={jobTypes} />
          ) : tab === "running" ? (
            <RunningTab
              activeTasks={activeTasks}
              onCancel={handleCancel}
              actionLoading={actionLoading}
            />
          ) : tab === "failed" ? (
            <FailedTab
              results={failedResults}
              onRetry={handleRetry}
              actionLoading={actionLoading}
              expandedResultId={expandedResultId}
              onToggleDetails={setExpandedResultId}
            />
          ) : (
            <ArchivedTab
              results={archivedResults}
              expandedResultId={expandedResultId}
              onToggleDetails={setExpandedResultId}
            />
          )}
        </section>
      </div>

      {/* Manual refresh button */}
      <button
        type="button"
        className="job-worker__refresh-btn"
        onClick={fetchStatsAndResults}
        aria-label="Refresh jobs now"
        title="Refresh now"
      >
        <RefreshCw size={20} aria-hidden />
      </button>
    </div>
  );
}

function RunningTab({
  activeTasks,
  onCancel,
  actionLoading,
}: {
  activeTasks: ActiveTask[];
  onCancel: (taskId: string) => void;
  actionLoading: string | null;
}) {
  if (activeTasks.length === 0) {
    return (
      <div className="job-worker__empty">
        <AlertTriangle size={48} className="job-worker__empty-icon" aria-hidden />
        <p className="job-worker__empty-text">No running jobs at the moment.</p>
      </div>
    );
  }
  return (
    <ul className="job-worker__list">
      {activeTasks.map((task) => (
        <li key={task.id} className="job-worker__card-wrap">
          <article className="job-worker__card job-worker__card--running">
            <div className="job-worker__card-header">
              <div className="job-worker__card-title-row">
                <h3 className="job-worker__card-title">{runningTaskTitle(task)}</h3>
                <span className="job-worker__badge job-worker__badge--running">
                  <Loader2 size={12} className="job-worker__badge-spinner" aria-hidden />
                  Running
                </span>
              </div>
              <code className="job-worker__job-id">{shortUuid(task.id)}</code>
              {task.job_type && (
                <code className="job-worker__celery-task-name">{task.job_type}</code>
              )}
            </div>
            <div className="job-worker__card-meta">
              {task.name && runningTaskTitle(task) !== task.name && (
                <span className="job-worker__meta-item" title="Celery task name">
                  <FileText size={14} aria-hidden />
                  {task.name}
                </span>
              )}
              <span className="job-worker__meta-item">
                <Clock size={14} aria-hidden />
                Worker: {task.worker}
              </span>
              {task.started_at != null && (
                <span className="job-worker__meta-item">
                  Started {formatTimestamp(task.started_at)}
                </span>
              )}
            </div>
            <div className="job-worker__card-actions">
              <button
                type="button"
                className="job-worker__btn job-worker__btn--danger"
                onClick={() => onCancel(task.id)}
                disabled={actionLoading === task.id}
                aria-label="Cancel job"
              >
                {actionLoading === task.id ? (
                  <Loader2 size={16} className="job-worker__stat-icon--spin" aria-hidden />
                ) : (
                  <XCircle size={16} aria-hidden />
                )}
                Cancel
              </button>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

function FailedTab({
  results,
  onRetry,
  actionLoading,
}: {
  results: TaskResult[];
  onRetry: (taskId: string) => void;
  actionLoading: string | null;
}) {
  if (results.length === 0) {
    return (
      <div className="job-worker__empty">
        <AlertTriangle size={48} className="job-worker__empty-icon" aria-hidden />
        <p className="job-worker__empty-text">No failed jobs at the moment.</p>
      </div>
    );
  }
  return (
    <ul className="job-worker__list">
      {results.map((r) => (
        <li key={r.task_id} className="job-worker__card-wrap">
          <article className="job-worker__card job-worker__card--failed">
            <div className="job-worker__card-header">
              <div className="job-worker__card-title-row">
                <h3 className="job-worker__card-title">{taskResultTitle(r)}</h3>
                <span className="job-worker__badge job-worker__badge--failed">
                  <XCircle size={12} aria-hidden />
                  Failed
                </span>
              </div>
              <code className="job-worker__job-id">{shortUuid(r.task_id)}</code>
              {r.job_type && (
                <code className="job-worker__celery-task-name">{r.job_type}</code>
              )}
            </div>
            <div className="job-worker__card-meta">
              {r.task_name && taskResultTitle(r) !== r.task_name && (
                <span className="job-worker__meta-item" title="Celery task name">
                  <FileText size={14} aria-hidden />
                  {r.task_name}
                </span>
              )}
              {r.date_done && (
                <span className="job-worker__meta-item">
                  <Clock size={14} aria-hidden />
                  Failed {formatTimestamp(r.date_done)}
                </span>
              )}
            </div>
            {expandedResultId !== r.task_id &&
              (() => {
                const line =
                  typeof r.result === "string" && r.result.trim()
                    ? r.result.trim().slice(0, 160) +
                      (r.result.length > 160 ? "…" : "")
                    : r.result != null
                      ? JSON.stringify(r.result).slice(0, 160) + "…"
                      : r.details?.traceback
                        ? "Open details for full traceback."
                        : null;
                return line ? (
                  <p className="job-worker__detail-hint">{line}</p>
                ) : null;
              })()}
            <div className="job-worker__card-actions">
              <button
                type="button"
                className="job-worker__btn job-worker__btn--secondary"
                onClick={() =>
                  onToggleDetails(expandedResultId === r.task_id ? null : r.task_id)
                }
                aria-label="View details"
                aria-expanded={expandedResultId === r.task_id}
              >
                {expandedResultId === r.task_id ? (
                  <>
                    <ChevronDown size={16} aria-hidden />
                    Hide details
                  </>
                ) : (
                  <>
                    <FileText size={16} aria-hidden />
                    View details
                  </>
                )}
              </button>
              <button
                type="button"
                className="job-worker__btn job-worker__btn--primary"
                onClick={() => onRetry(r.task_id)}
                disabled={actionLoading === r.task_id}
                aria-label="Retry job"
              >
                {actionLoading === r.task_id ? (
                  <Loader2 size={16} className="job-worker__stat-icon--spin" aria-hidden />
                ) : (
                  <RotateCcw size={16} aria-hidden />
                )}
                Retry
              </button>
            </div>
            {expandedResultId === r.task_id && <TaskExpandedPanels r={r} />}
          </article>
        </li>
      ))}
    </ul>
  );
}

function ArchivedTab({
  results,
  expandedResultId,
  onToggleDetails,
}: {
  results: TaskResult[];
  expandedResultId: string | null;
  onToggleDetails: (id: string | null) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="job-worker__empty">
        <AlertTriangle size={48} className="job-worker__empty-icon" aria-hidden />
        <p className="job-worker__empty-text">No archived jobs at the moment.</p>
      </div>
    );
  }
  return (
    <ul className="job-worker__list">
      {results.map((r) => (
        <li key={r.task_id} className="job-worker__card-wrap">
          <article className="job-worker__card job-worker__card--completed">
            <div className="job-worker__card-header">
              <div className="job-worker__card-title-row">
                <h3 className="job-worker__card-title">{taskResultTitle(r)}</h3>
                <span className="job-worker__badge job-worker__badge--completed">
                  <CheckCircle2 size={12} aria-hidden />
                  Completed
                </span>
              </div>
              <code className="job-worker__job-id">{shortUuid(r.task_id)}</code>
              {r.job_type && (
                <code className="job-worker__celery-task-name">{r.job_type}</code>
              )}
            </div>
            <div className="job-worker__card-meta">
              {r.task_name && taskResultTitle(r) !== r.task_name && (
                <span className="job-worker__meta-item" title="Celery task name">
                  <FileText size={14} aria-hidden />
                  {r.task_name}
                </span>
              )}
              {r.date_done && (
                <span className="job-worker__meta-item">
                  <Clock size={14} aria-hidden />
                  Completed {formatTimestamp(r.date_done)}
                </span>
              )}
            </div>
            <div className="job-worker__card-actions">
              <button
                type="button"
                className="job-worker__btn job-worker__btn--secondary"
                onClick={() =>
                  onToggleDetails(expandedResultId === r.task_id ? null : r.task_id)
                }
                aria-label="View details"
                aria-expanded={expandedResultId === r.task_id}
              >
                {expandedResultId === r.task_id ? (
                  <>
                    <ChevronDown size={16} aria-hidden />
                    Hide Details
                  </>
                ) : (
                  <>
                    <FileText size={16} aria-hidden />
                    View Details
                  </>
                )}
              </button>
            </div>
            {expandedResultId === r.task_id && <TaskExpandedPanels r={r} />}
          </article>
        </li>
      ))}
    </ul>
  );
}

function JobTypesGrid({ jobTypes }: { jobTypes: JobType[] }) {
  if (jobTypes.length === 0) {
    return (
      <div className="job-worker__empty">
        <AlertTriangle size={48} className="job-worker__empty-icon" aria-hidden />
        <p className="job-worker__empty-text">No job types registered.</p>
      </div>
    );
  }
  return (
    <div className="job-worker__types-grid">
      {jobTypes.map((jt) => (
        <article key={jt.job_type} className="job-worker__card job-worker__card--type">
          <div className="job-worker__card-header">
            <h3 className="job-worker__card-title">{jt.job_type}</h3>
          </div>
          <p className="job-worker__card-desc">{jt.description || "—"}</p>
          <div className="job-worker__card-meta">
            <span className="job-worker__meta-item">Queue: {jt.queue}</span>
            <span className="job-worker__meta-item">Runtime: {jt.runtime}</span>
            <span className="job-worker__meta-item">Max retries: {jt.max_retries}</span>
            <span className="job-worker__meta-item">Retry delay: {jt.retry_delay}s</span>
            <span className="job-worker__meta-item">Dedup TTL: {jt.dedup_ttl}s</span>
            <span className="job-worker__meta-item">
              Scheduled: {jt.has_schedule ? "Yes" : "No"}
            </span>
          </div>
          {jt.has_schedule && jt.schedule && Object.keys(jt.schedule).length > 0 && (
            <div className="job-worker__schedule">
              <h4 className="job-worker__logs-title">Schedule</h4>
              <pre className="job-worker__result-json">
                {JSON.stringify(jt.schedule, null, 2)}
              </pre>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
