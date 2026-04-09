import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, ClipboardList } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import {
  listClassrooms,
  listClassroomSessions,
  listClassroomStudents,
} from "../../lib/api/classrooms";
import {
  listStudents,
  listAttendanceExcusalRequestsStaff,
  reviewAttendanceExcusalRequest,
  type AttendanceExcusalStaffRow,
  type StudentProfile,
} from "../../lib/api/students";
import { ApiHttpError } from "../../lib/api/client";
import { listUsers } from "../../lib/api/users";
import { listNotifications, type NotificationRecord } from "../../lib/api/notifications";
import { fetchAnalyticsSummary, type AnalyticsTotals } from "../../lib/api/analytics";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import "./dashboard-bento.css";
import "./admin-dashboard.css";

function isLiveSession(sessionStart: string, sessionEnd: string, status: string): boolean {
  if (status === "completed" || status === "canceled") return false;
  const now = Date.now();
  const start = new Date(sessionStart).getTime();
  const end = new Date(sessionEnd).getTime();
  return start <= now && now <= end;
}

function toRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminDashboard() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [activeClasses, setActiveClasses] = useState<
    Array<{ id: string; name: string; students: number; isLive: boolean }>
  >([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [activityTotals, setActivityTotals] = useState<AnalyticsTotals | null>(null);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [pendingExcusals, setPendingExcusals] = useState<AttendanceExcusalStaffRow[]>([]);
  const [excusalsLoading, setExcusalsLoading] = useState(false);
  const [excusalsError, setExcusalsError] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");
  const [excusalActionId, setExcusalActionId] = useState<string | null>(null);

  const tenantName = tenant?.name ?? "Organization";
  const greeting = user?.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";
  const unreadAnnouncements = useMemo(
    () => notifications.filter((item) => !item.is_read),
    [notifications],
  );
  const totalMembers = totalUsers + allStudents.length;
  const ongoingClass = useMemo(
    () => activeClasses.find((klass) => klass.isLive) ?? null,
    [activeClasses],
  );

  const tenantId = tenant?.id ?? user?.tenantId;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [classrooms, students, usersResult, notificationResult, analyticsSummary] = await Promise.all([
        listClassrooms({ limit: 50, is_active: true }),
        listStudents({ limit: 500, is_active: true }),
        listUsers({ limit: 500 }),
        listNotifications({ limit: 12 }).catch(() => ({ items: [], total: 0 })),
        fetchAnalyticsSummary({ dateFrom: thirtyDaysAgo, dateTo: now }).catch(() => null),
      ]);
      setAllStudents(students);
      setTotalUsers(usersResult.total ?? usersResult.items.length);
      setNotifications(notificationResult.items);
      setActivityTotals(analyticsSummary?.totals ?? null);
      setAttendanceRate(analyticsSummary?.attendance_rate ?? null);

      setExcusalsLoading(true);
      try {
        const pending = await listAttendanceExcusalRequestsStaff({
          status: "pending",
          limit: 10,
        });
        setPendingExcusals(pending);
        setExcusalsError(null);
      } catch (e) {
        setPendingExcusals([]);
        if (e instanceof ApiHttpError) {
          setExcusalsError(e.message || `Could not load requests (${e.status})`);
        } else if (e instanceof Error) {
          setExcusalsError(e.message);
        } else {
          setExcusalsError("Could not load requests");
        }
      } finally {
        setExcusalsLoading(false);
      }

      const classSessions = await Promise.all(
        classrooms.slice(0, 20).map(async (klass) => ({
          classroom: klass,
          sessions: await listClassroomSessions(klass.id, 40).catch(() => []),
        })),
      );
      let selected = classSessions.filter(({ sessions }) =>
        sessions.some((s) => isLiveSession(s.session_start, s.session_end, s.status)),
      );
      if (selected.length === 0) selected = classSessions.slice(0, 3);
      selected = selected.slice(0, 3);
      const classesWithCounts = await Promise.all(
        selected.map(async ({ classroom }) => {
          const roster = await listClassroomStudents(classroom.id).catch(() => []);
          return {
            id: classroom.id,
            name: classroom.name,
            students: roster.length,
            isLive: classSessions
              .find((entry) => entry.classroom.id === classroom.id)
              ?.sessions.some((s) => isLiveSession(s.session_start, s.session_end, s.status)) ?? false,
          };
        }),
      );
      setActiveClasses(classesWithCounts);
    } catch {
      setActiveClasses([]);
      setAllStudents([]);
      setTotalUsers(0);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: loadDashboard,
    onNotificationsInvalidate: loadDashboard,
  });

  const refreshExcusals = useCallback(async () => {
    setExcusalsLoading(true);
    try {
      const pending = await listAttendanceExcusalRequestsStaff({
        status: "pending",
        limit: 10,
      });
      setPendingExcusals(pending);
      setExcusalsError(null);
    } catch (e) {
      setPendingExcusals([]);
      if (e instanceof ApiHttpError) {
        setExcusalsError(e.message || `Could not load requests (${e.status})`);
      } else if (e instanceof Error) {
        setExcusalsError(e.message);
      } else {
        setExcusalsError("Could not load requests");
      }
    } finally {
      setExcusalsLoading(false);
    }
  }, []);

  const approveExcusal = async (id: string) => {
    setExcusalActionId(id);
    try {
      await reviewAttendanceExcusalRequest(id, { decision: "approved" });
      await refreshExcusals();
    } finally {
      setExcusalActionId(null);
    }
  };

  const submitDeny = async (id: string) => {
    setExcusalActionId(id);
    try {
      await reviewAttendanceExcusalRequest(id, {
        decision: "denied",
        review_notes: denyNote.trim() || null,
      });
      setDenyingId(null);
      setDenyNote("");
      await refreshExcusals();
    } finally {
      setExcusalActionId(null);
    }
  };

  return (
    <div
      className="dashboard-bento admin-dashboard"
      role="main"
      aria-label="Admin dashboard"
    >
      <header className="dashboard-bento__header admin-dashboard__header-row">
        <div>
          <h1 className="dashboard-bento__greeting">{greeting}</h1>
          <p className="dashboard-bento__subtitle">{tenantName}</p>
        </div>
        <div className="admin-dashboard__header-actions">
          <Link to="/app/analytics" className="admin-dashboard__header-btn admin-dashboard__header-btn--secondary">
            <img src="/assets/cartoon-icons/Trail.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            Insights
          </Link>
          <Link to="/app/members" className="admin-dashboard__header-btn">
            <img src="/assets/cartoon-icons/Players.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            Enroll Student
          </Link>
        </div>
      </header>
      {unreadAnnouncements.length > 0 ? (
        <section className="admin-dashboard__announcement-banner" aria-live="polite">
          <div className="admin-dashboard__announcement-banner-icon" aria-hidden>
            <img src="/assets/cartoon-icons/Information.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
          </div>
          <div>
            <strong>
              {unreadAnnouncements.length} unread announcement
              {unreadAnnouncements.length === 1 ? "" : "s"}
            </strong>
            <p>{unreadAnnouncements[0]?.title ?? "New organization updates available."}</p>
          </div>
          <Link to="/app/notifications" className="admin-dashboard__announcement-banner-link">
            Open inbox <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      ) : null}

      <div className="dashboard-bento__grid">
        {/* Active Classes - cols 1-2, rows 1-2 */}
        <div className="dashboard-bento__card dashboard-bento__card--blue admin-dashboard__card--classes">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Active Classes</h2>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/bag.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          {ongoingClass ? (
            <div className="admin-dashboard__class-focus admin-dashboard__class-focus--live" aria-label="Ongoing class">
              <div className="admin-dashboard__class-focus-top">
                <span className="admin-dashboard__class-tag admin-dashboard__class-tag--active">Live Now</span>
                <span className="admin-dashboard__class-focus-meta">{ongoingClass.students} students</span>
              </div>
              <h3 className="admin-dashboard__class-focus-title">{ongoingClass.name}</h3>
              <Link
                to={`/app/classrooms/${ongoingClass.id}/live`}
                className="admin-dashboard__class-focus-cta admin-dashboard__class-focus-cta--live"
              >
                Open live room <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
          ) : (
            <div className="admin-dashboard__class-focus admin-dashboard__class-focus--empty" aria-label="No live session">
              <div className="admin-dashboard__class-focus-top">
                <span className="admin-dashboard__class-tag admin-dashboard__class-tag--idle">
                  {loading ? "Checking" : "No Live Session"}
                </span>
                <AlertTriangle size={16} aria-hidden />
              </div>
              <h3 className="admin-dashboard__class-focus-title">
                {loading ? "Checking classrooms..." : "No class is live right now"}
              </h3>
              <p className="admin-dashboard__class-focus-sub">
                {loading
                  ? "Please wait while we fetch live session data."
                  : "Start a session from any classroom to see it highlighted here."}
              </p>
              <Link to="/app/classrooms" className="admin-dashboard__class-focus-cta admin-dashboard__class-focus-cta--idle">
                Open classrooms <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          )}
          <Link
            to="/app/classrooms"
            className="dashboard-bento__card-action"
            aria-label="Manage classes"
          >
            Manage classes <ArrowRight size={14} aria-hidden />
          </Link>
          <ul className="dashboard-bento__activity-list admin-dashboard__class-list" role="list">
            {loading ? (
              <li className="admin-dashboard__class-item" role="listitem">
                <span className="admin-dashboard__class-meta">Loading classes...</span>
              </li>
            ) : activeClasses.length === 0 ? (
              <li className="admin-dashboard__class-item" role="listitem">
                <span className="admin-dashboard__class-meta">No classes available yet.</span>
              </li>
            ) : activeClasses.map((c) => (
              <li key={c.id} className="admin-dashboard__class-item" role="listitem">
                <Link to={`/app/classrooms/${c.id}`} className="admin-dashboard__class-link">
                  <span className="admin-dashboard__class-info">
                    <span className="admin-dashboard__class-name">{c.name}</span>
                    <span className="admin-dashboard__class-meta">
                      {c.students} students
                    </span>
                  </span>
                  <span className={`admin-dashboard__class-tag admin-dashboard__class-tag--${c.isLive ? "active" : "idle"}`}>
                    {c.isLive ? "Live" : "Class"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Enrollment - col 3, row 1 */}
        <div className="dashboard-bento__card dashboard-bento__card--green admin-dashboard__card--enrollment">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Enrollment</h2>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Players.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">{totalMembers}</span>
            <span className="admin-dashboard__stat-label">Total Members</span>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">{allStudents.length}</span>
            <span className="admin-dashboard__stat-label">Active Students</span>
          </div>
          <Link
            to="/app/members"
            className="dashboard-bento__card-action"
            aria-label="View members"
          >
            View all <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {/* Learning Activity - col 3, row 2 */}
        <div className="dashboard-bento__card dashboard-bento__card--orange admin-dashboard__card--revenue">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Learning Activity</h2>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Trail.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">
              {activityTotals ? activityTotals.lab_completions + activityTotals.lesson_completions : (loading ? "…" : "0")}
            </span>
            <span className="admin-dashboard__stat-label">Completions (30 days)</span>
          </div>
          <div className="admin-dashboard__trend">
            <img src="/assets/cartoon-icons/coin.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            <span>
              {attendanceRate != null
                ? `${Math.round(attendanceRate * 100)}% attendance rate`
                : "Attendance data pending"}
            </span>
          </div>
          <Link
            to="/app/analytics"
            className="dashboard-bento__card-action"
            aria-label="View analytics"
          >
            View insights <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {/* Instructor Activity - full width row 3 */}
        <div className="dashboard-bento__card dashboard-bento__card--purple admin-dashboard__card--activity">
          <div className="dashboard-bento__card-header admin-dashboard__activity-header">
            <div>
              <h2 className="dashboard-bento__card-title">Instructor Activity</h2>
              <Link
                to="/app/audit"
                className="dashboard-bento__card-action"
                aria-label="View audit log"
              >
                View all <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Trail.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <ul className="dashboard-bento__activity-list" role="list">
            {notifications.slice(0, 4).map((item) => (
              <li key={item.id} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">{item.title}</span>
                <span className="dashboard-bento__activity-time">{toRelativeTime(item.created_at)}</span>
              </li>
            ))}
            {notifications.length === 0 ? (
              <li className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">No recent activity yet.</span>
              </li>
            ) : null}
          </ul>
        </div>

        {/* Announcements - col 4, rows 1-2 */}
        <div className="dashboard-bento__card dashboard-bento__card--red admin-dashboard__card--announcements">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Announcements</h2>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Bell.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__announcements">
            {unreadAnnouncements.slice(0, 2).map((a) => (
              <div key={a.id} className="admin-dashboard__announcement">
                <span className="admin-dashboard__announcement-date">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
                <h3 className="admin-dashboard__announcement-title">{a.title}</h3>
                <p className="admin-dashboard__announcement-preview">
                  {a.body || "Open notification inbox to view full details."}
                </p>
              </div>
            ))}
            {unreadAnnouncements.length === 0 ? (
              <div className="admin-dashboard__announcement">
                <h3 className="admin-dashboard__announcement-title">No unread announcements</h3>
                <p className="admin-dashboard__announcement-preview">
                  You are all caught up.
                </p>
              </div>
            ) : null}
          </div>
          <Link
            to="/app/notifications"
            className="dashboard-bento__card-action"
            aria-label="View all announcements"
          >
            View all <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="dashboard-bento__card dashboard-bento__card--orange admin-dashboard__card--excusals">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Parent excusal requests</h2>
            <div className="dashboard-bento__card-icon">
              <ClipboardList size={22} aria-hidden />
            </div>
          </div>
          <Link
            to="/app/excusals"
            className="dashboard-bento__card-action"
            aria-label="View all parent excusal requests"
          >
            View all <ArrowRight size={14} aria-hidden />
          </Link>
          <p className="admin-dashboard__excusals-intro">
            When guardians submit an absence excuse, approve it to record the learner as excused for
            that session, or deny with an optional note.
          </p>
          {excusalsLoading ? (
            <p className="dashboard-bento__card-desc">Loading…</p>
          ) : excusalsError ? (
            <p className="dashboard-bento__card-desc" role="alert">{excusalsError}</p>
          ) : pendingExcusals.length === 0 ? (
            <p className="dashboard-bento__card-desc">No pending requests.</p>
          ) : (
            <ul className="admin-dashboard__excusal-list" role="list">
              {pendingExcusals.map((row) => (
                <li key={row.id} className="admin-dashboard__excusal-item" role="listitem">
                  <div className="admin-dashboard__excusal-top">
                    <strong className="admin-dashboard__excusal-student">{row.student_display_name}</strong>
                    <span className="admin-dashboard__excusal-meta">
                      {row.classroom_name} ·{" "}
                      {new Date(row.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="admin-dashboard__excusal-reason">{row.reason}</p>
                  {denyingId === row.id ? (
                    <div className="admin-dashboard__excusal-deny-box">
                      <label className="admin-dashboard__excusal-label" htmlFor={`deny-note-${row.id}`}>
                        Optional note to guardian
                      </label>
                      <textarea
                        id={`deny-note-${row.id}`}
                        className="admin-dashboard__excusal-textarea"
                        rows={2}
                        value={denyNote}
                        onChange={(e) => setDenyNote(e.target.value)}
                        maxLength={1000}
                      />
                      <div className="admin-dashboard__excusal-actions">
                        <button
                          type="button"
                          className="admin-dashboard__excusal-btn admin-dashboard__excusal-btn--ghost"
                          onClick={() => {
                            setDenyingId(null);
                            setDenyNote("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="admin-dashboard__excusal-btn admin-dashboard__excusal-btn--danger"
                          disabled={excusalActionId === row.id}
                          onClick={() => void submitDeny(row.id)}
                        >
                          {excusalActionId === row.id ? "Saving…" : "Confirm deny"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-dashboard__excusal-actions">
                      <button
                        type="button"
                        className="admin-dashboard__excusal-btn admin-dashboard__excusal-btn--primary"
                        disabled={excusalActionId === row.id}
                        onClick={() => void approveExcusal(row.id)}
                      >
                        {excusalActionId === row.id ? "Saving…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="admin-dashboard__excusal-btn admin-dashboard__excusal-btn--ghost"
                        disabled={excusalActionId != null}
                        onClick={() => {
                          setDenyingId(row.id);
                          setDenyNote("");
                        }}
                      >
                        Deny
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
