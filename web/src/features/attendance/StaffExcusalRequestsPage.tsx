import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, CheckCircle2, XCircle, Clock, ClipboardList } from "lucide-react";
import { KidDropdown } from "../../components/ui";
import {
  listAttendanceExcusalRequestsStaff,
  reviewAttendanceExcusalRequest,
  type AttendanceExcusalStaffRow,
} from "../../lib/api/students";
import { ApiHttpError } from "../../lib/api/client";
import "../../components/ui/ui.css";
import "./staff-excusals.css";

const PAGE_SIZE = 20;

type StatusFilter = "pending" | "approved" | "denied";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
];

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

function statusBadge(status: string) {
  if (status === "approved")
    return (
      <span className="staff-excusals__badge staff-excusals__badge--approved">
        <CheckCircle2 size={14} aria-hidden /> Approved
      </span>
    );
  if (status === "denied")
    return (
      <span className="staff-excusals__badge staff-excusals__badge--denied">
        <XCircle size={14} aria-hidden /> Denied
      </span>
    );
  return (
    <span className="staff-excusals__badge staff-excusals__badge--pending">
      <Clock size={14} aria-hidden /> Pending
    </span>
  );
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
        <div className="staff-excusals__header-row">
          <div className="staff-excusals__header-icon">
            <ClipboardList size={28} aria-hidden />
          </div>
          <div>
            <h1 className="staff-excusals__title">Parent Excusal Requests</h1>
            <p className="staff-excusals__subtitle">
              Review guardian-submitted absence requests. Approve or deny with an optional note.
            </p>
          </div>
        </div>
      </header>

      <div className="staff-excusals__toolbar">
        <KidDropdown
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val as StatusFilter);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
          ariaLabel="Filter by status"
          minWidth={180}
        />
        <span className="staff-excusals__count">
          {loading ? "Loading..." : `${visibleRows.length} request${visibleRows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error ? (
        <div className="staff-excusals__error-card" role="alert">
          <XCircle size={18} aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && !error && visibleRows.length === 0 ? (
        <div className="staff-excusals__empty">
          <ClipboardList size={40} aria-hidden />
          <p>No {statusFilter} requests</p>
          <span>
            {statusFilter === "pending"
              ? "All caught up! No requests need your attention right now."
              : `No ${statusFilter} requests found.`}
          </span>
        </div>
      ) : null}

      {!loading && !error && visibleRows.length > 0 ? (
        <ul className="staff-excusals__list" role="list">
          {visibleRows.map((row) => (
            <li key={row.id} className="staff-excusals__item" role="listitem">
              <div className="staff-excusals__top">
                <div className="staff-excusals__student-info">
                  <strong className="staff-excusals__student-name">{row.student_display_name}</strong>
                  <span className="staff-excusals__meta">
                    {row.classroom_name} &middot; {whenLabel(row.created_at)}
                  </span>
                </div>
                {statusBadge(row.status)}
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
                        placeholder="Reason for denying this request..."
                      />
                      <div className="staff-excusals__actions">
                        <button
                          type="button"
                          className="ui-btn ui-btn--ghost"
                          onClick={() => {
                            setDenyingId(null);
                            setDenyNote("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="ui-btn ui-btn--danger"
                          disabled={actionId === row.id}
                          onClick={() => void deny(row.id)}
                        >
                          {actionId === row.id ? "Saving..." : "Confirm Deny"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="staff-excusals__actions">
                      <button
                        type="button"
                        className="ui-btn ui-btn--primary"
                        disabled={actionId === row.id}
                        onClick={() => void approve(row.id)}
                      >
                        {actionId === row.id ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost"
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
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && visibleRows.length > 0 && (
        <nav className="staff-excusals__pager" aria-label="Excusal request pages">
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="staff-excusals__pager-meta">Page {page}</span>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={loading || !hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
