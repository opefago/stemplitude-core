import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  listAttendanceExcusalRequestsStaff,
  reviewAttendanceExcusalRequest,
  type AttendanceExcusalStaffRow,
} from "../../lib/api/students";
import { ApiHttpError } from "../../lib/api/client";
import "./staff-excusals.css";

const PAGE_SIZE = 20;

type StatusFilter = "pending" | "approved" | "denied";

function whenLabel(iso: string): string {
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

export function StaffExcusalRequestsPage() {
  const [rows, setRows] = useState<AttendanceExcusalStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");

  const skip = (page - 1) * PAGE_SIZE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAttendanceExcusalRequestsStaff({
        status: statusFilter,
        skip,
        limit: PAGE_SIZE + 1,
      });
      setRows(data);
    } catch (e) {
      setRows([]);
      if (e instanceof ApiHttpError) {
        setError(e.message || `Could not load requests (${e.status})`);
      } else {
        setError(e instanceof Error ? e.message : "Could not load requests");
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, skip]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasNextPage = rows.length > PAGE_SIZE;
  const visibleRows = useMemo(() => rows.slice(0, PAGE_SIZE), [rows]);

  useEffect(() => {
    // Keep page bounded if filter shrinks result set.
    if (!loading && page > 1 && visibleRows.length === 0) {
      setPage((p) => Math.max(1, p - 1));
    }
  }, [loading, page, visibleRows.length]);

  const approve = async (id: string) => {
    setActionId(id);
    try {
      await reviewAttendanceExcusalRequest(id, { decision: "approved" });
      await load();
    } finally {
      setActionId(null);
    }
  };

  const deny = async (id: string) => {
    setActionId(id);
    try {
      await reviewAttendanceExcusalRequest(id, {
        decision: "denied",
        review_notes: denyNote.trim() || null,
      });
      setDenyingId(null);
      setDenyNote("");
      await load();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="staff-excusals" role="main" aria-label="Parent excusal requests">
      <header className="staff-excusals__header">
        <Link to="/app" className="staff-excusals__crumb">
          <ChevronLeft size={18} aria-hidden /> Dashboard
        </Link>
        <h1 className="staff-excusals__title">Parent excusal requests</h1>
        <p className="staff-excusals__subtitle">
          Review guardian-submitted absence requests. Dashboard preview shows only the latest 10;
          use this page for the full queue.
        </p>
      </header>

      <div className="staff-excusals__toolbar">
        <label htmlFor="excusal-status" className="staff-excusals__label">
          Status
        </label>
        <select
          id="excusal-status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="staff-excusals__select"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      {loading ? <p className="staff-excusals__muted">Loading…</p> : null}
      {error ? (
        <p className="staff-excusals__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && visibleRows.length === 0 ? (
        <p className="staff-excusals__muted">No {statusFilter} requests.</p>
      ) : null}

      {!loading && !error && visibleRows.length > 0 ? (
        <ul className="staff-excusals__list" role="list">
          {visibleRows.map((row) => (
            <li key={row.id} className="staff-excusals__item" role="listitem">
              <div className="staff-excusals__top">
                <strong>{row.student_display_name}</strong>
                <span className="staff-excusals__meta">
                  {row.classroom_name} · {whenLabel(row.created_at)}
                </span>
              </div>
              <p className="staff-excusals__reason">{row.reason}</p>
              {row.status === "pending" ? (
                <>
                  {denyingId === row.id ? (
                    <div className="staff-excusals__deny-box">
                      <label className="staff-excusals__label" htmlFor={`deny-note-${row.id}`}>
                        Optional note to guardian
                      </label>
                      <textarea
                        id={`deny-note-${row.id}`}
                        value={denyNote}
                        onChange={(e) => setDenyNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        className="staff-excusals__textarea"
                      />
                      <div className="staff-excusals__actions">
                        <button
                          type="button"
                          className="staff-excusals__btn staff-excusals__btn--ghost"
                          onClick={() => {
                            setDenyingId(null);
                            setDenyNote("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="staff-excusals__btn staff-excusals__btn--danger"
                          disabled={actionId === row.id}
                          onClick={() => void deny(row.id)}
                        >
                          {actionId === row.id ? "Saving…" : "Confirm deny"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="staff-excusals__actions">
                      <button
                        type="button"
                        className="staff-excusals__btn staff-excusals__btn--primary"
                        disabled={actionId === row.id}
                        onClick={() => void approve(row.id)}
                      >
                        {actionId === row.id ? "Saving…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="staff-excusals__btn staff-excusals__btn--ghost"
                        disabled={actionId != null}
                        onClick={() => {
                          setDenyingId(row.id);
                          setDenyNote("");
                        }}
                      >
                        Deny
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="staff-excusals__muted">
                  Status: <strong>{row.status}</strong>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <nav className="staff-excusals__pager" aria-label="Excusal request pages">
        <button
          type="button"
          className="staff-excusals__btn staff-excusals__btn--ghost"
          disabled={loading || page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span className="staff-excusals__pager-meta">Page {page}</span>
        <button
          type="button"
          className="staff-excusals__btn staff-excusals__btn--ghost"
          disabled={loading || !hasNextPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
