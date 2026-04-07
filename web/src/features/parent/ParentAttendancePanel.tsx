import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker, KidDropdown } from "../../components/ui";
import {
  getParentChildren,
  getParentChildAttendanceOverview,
  type GuardianAttendanceSessionRow,
  type StudentProfile,
} from "../../lib/api/students";
import { studentProfileDisplayName } from "../../lib/studentDisplayName";
import "../../components/ui/ui.css";
import "./parent-attendance-panel.css";

const PAGE_SIZE = 10;

function formatSessionRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const d = s.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const t = e.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${d} – ${t}`;
  } catch {
    return startIso;
  }
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

export function ParentAttendancePanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentParam = searchParams.get("studentId");

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(studentParam);
  const [rows, setRows] = useState<GuardianAttendanceSessionRow[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingChildren(true);
      try {
        const list = await getParentChildren();
        if (cancelled) return;
        setChildren(list);
        setActiveStudentId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setChildren([]);
          setActiveStudentId(null);
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (studentParam && children.some((c) => c.id === studentParam)) {
      setActiveStudentId(studentParam);
    }
  }, [studentParam, children]);

  const loadOverview = useCallback(async (studentId: string) => {
    setLoadingOverview(true);
    setError(null);
    try {
      const data = await getParentChildAttendanceOverview(studentId);
      setRows(data.rows);
      setPage(1);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load attendance");
      setPage(1);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (!activeStudentId) {
      setRows([]);
      return;
    }
    void loadOverview(activeStudentId);
  }, [activeStudentId, loadOverview]);

  const onPickChild = (id: string) => {
    setActiveStudentId(id);
    const next = new URLSearchParams(searchParams);
    next.set("studentId", id);
    setSearchParams(next, { replace: true });
  };

  const activeChild = children.find((c) => c.id === activeStudentId);
  const childOptions = useMemo(
    () =>
      children.map((c) => ({
        value: c.id,
        label: studentProfileDisplayName(c),
      })),
    [children],
  );
  const sortOptions = useMemo(
    () => [
      { value: "newest", label: "Newest first" },
      { value: "oldest", label: "Oldest first" },
    ],
    [],
  );
  const pageSizeOptions = useMemo(
    () => [
      { value: "10", label: "10" },
      { value: "25", label: "25" },
      { value: "50", label: "50" },
    ],
    [],
  );

  const processedRows = useMemo(() => {
    const inRange = rows.filter((row) => {
      const day = row.session_start.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
    inRange.sort((a, b) => {
      const aTs = new Date(a.session_start).getTime();
      const bTs = new Date(b.session_start).getTime();
      return sortOrder === "newest" ? bTs - aTs : aTs - bTs;
    });
    return inRange;
  }, [rows, fromDate, toDate, sortOrder]);

  useEffect(() => {
    setPage(1);
  }, [activeStudentId, pageSize, sortOrder, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRows = processedRows.slice(pageStart, pageStart + pageSize);

  return (
    <main className="msg-hub-panel parent-attendance" aria-label="Attendance">
      <div className="parent-attendance__head">
        <h2 className="msg-hub-panel__title">Attendance</h2>
        <p className="msg-hub-panel__desc">
          See class sessions and recorded attendance for your learner, including excusal status when
          you&apos;ve submitted a request from{" "}
          <strong>Class days</strong> (Messages) or <strong>Upcoming this week</strong> on your home
          dashboard.
        </p>
      </div>

      {loadingChildren ? (
        <p className="msg-hub-panel__muted">Loading…</p>
      ) : children.length === 0 ? (
        <p className="msg-hub-panel__muted">No linked learners in this workspace.</p>
      ) : (
        <>
          <div className="parent-attendance__toolbar">
            <label className="parent-attendance__label parent-attendance__control">
              Learner
              <KidDropdown
                value={activeStudentId ?? ""}
                options={childOptions}
                onChange={onPickChild}
                ariaLabel="Select learner"
                fullWidth
              />
            </label>
            <label className="parent-attendance__label parent-attendance__control">
              Sort
              <KidDropdown
                value={sortOrder}
                options={sortOptions}
                onChange={(value) => setSortOrder(value as "newest" | "oldest")}
                ariaLabel="Sort sessions"
                fullWidth
              />
            </label>
            <label className="parent-attendance__label parent-attendance__control">
              Page size
              <KidDropdown
                value={String(pageSize)}
                options={pageSizeOptions}
                onChange={(value) => setPageSize(Number(value))}
                ariaLabel="Select page size"
                fullWidth
              />
            </label>
          </div>

          <div className="parent-attendance__toolbar parent-attendance__toolbar--filters">
            <label className="parent-attendance__label parent-attendance__control">
              From
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                id="parent-attendance-from"
                placeholder="From date"
                max={toDate || undefined}
              />
            </label>
            <label className="parent-attendance__label parent-attendance__control">
              To
              <DatePicker
                value={toDate}
                onChange={setToDate}
                id="parent-attendance-to"
                placeholder="To date"
                min={fromDate || undefined}
              />
            </label>
            <button
              type="button"
              className="parent-attendance__btn-secondary"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              disabled={!fromDate && !toDate}
            >
              Clear dates
            </button>
          </div>

          {error ? (
            <p className="parent-attendance__error" role="alert">
              {error}
            </p>
          ) : null}

          {loadingOverview ? (
            <p className="msg-hub-panel__muted">Loading sessions…</p>
          ) : processedRows.length === 0 ? (
            <p className="msg-hub-panel__muted">
              No sessions match your current filters for{" "}
              {activeChild ? studentProfileDisplayName(activeChild) : "this learner"}.
            </p>
          ) : (
            <>
              <div className="parent-attendance__table-wrap">
                <table className="parent-attendance__table">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Class</th>
                      <th scope="col">Attendance</th>
                      <th scope="col">Excusal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.session_id}>
                        <td>{formatSessionRange(row.session_start, row.session_end)}</td>
                        <td>{row.classroom_name}</td>
                        <td>
                          <span className="parent-attendance__status">
                            {statusLabel(row.attendance_status)}
                          </span>
                        </td>
                        <td>
                          {row.excusal ? (
                            <span
                              className={`parent-attendance__pill parent-attendance__pill--${row.excusal.status}`}
                            >
                              {row.excusal.status}
                            </span>
                          ) : (
                            <span className="msg-hub-panel__muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className="parent-attendance__pager" aria-label="Attendance pages">
                <button
                  type="button"
                  className="parent-attendance__pager-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="parent-attendance__pager-meta">
                  Page {currentPage} of {totalPages} · {processedRows.length} sessions
                </span>
                <button
                  type="button"
                  className="parent-attendance__pager-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </main>
  );
}
