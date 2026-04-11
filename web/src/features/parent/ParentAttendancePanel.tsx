import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getParentChildren,
  getParentChildAttendanceOverview,
  type GuardianAttendanceSessionRow,
  type StudentProfile,
} from "../../lib/api/students";
import { studentProfileDisplayName } from "../../lib/studentDisplayName";
import "./parent-attendance-panel.css";

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
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load attendance");
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
            <label className="parent-attendance__label" htmlFor="parent-attendance-child">
              Learner
            </label>
            <select
              id="parent-attendance-child"
              className="parent-attendance__select"
              value={activeStudentId ?? ""}
              onChange={(e) => onPickChild(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {studentProfileDisplayName(c)}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="parent-attendance__error" role="alert">
              {error}
            </p>
          ) : null}

          {loadingOverview ? (
            <p className="msg-hub-panel__muted">Loading sessions…</p>
          ) : rows.length === 0 ? (
            <p className="msg-hub-panel__muted">
              No class sessions in the current window for{" "}
              {activeChild ? studentProfileDisplayName(activeChild) : "this learner"}.
            </p>
          ) : (
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
                  {rows.map((row) => (
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
          )}
        </>
      )}
    </main>
  );
}
