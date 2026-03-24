import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  GraduationCap,
  School,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Megaphone,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import {
  listClassrooms,
  listClassroomSessions,
  listClassroomStudents,
} from "../../lib/api/classrooms";
import { listStudents, type StudentProfile } from "../../lib/api/students";
import { listUsers } from "../../lib/api/users";
import { listNotifications, type NotificationRecord } from "../../lib/api/notifications";
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
    Array<{ id: string; name: string; students: number }>
  >([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const tenantName = tenant?.name ?? "Organization";
  const greeting = user?.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";
  const unreadAnnouncements = useMemo(
    () => notifications.filter((item) => !item.is_read),
    [notifications],
  );
  const totalMembers = totalUsers + allStudents.length;

  const tenantId = tenant?.id ?? user?.tenantId;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [classrooms, students, usersResult, notificationResult] = await Promise.all([
        listClassrooms({ limit: 50, is_active: true }),
        listStudents({ limit: 500, is_active: true }),
        listUsers({ limit: 500 }),
        listNotifications({ limit: 12 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setAllStudents(students);
      setTotalUsers(usersResult.total ?? usersResult.items.length);
      setNotifications(notificationResult.items);

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
    onMessagesInvalidate: loadDashboard,
  });

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
        <Link to="/app/members" className="admin-dashboard__header-btn">
          <img src="/assets/cartoon-icons/Players.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
          Enroll Student
        </Link>
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
                <div className="admin-dashboard__class-info">
                  <span className="admin-dashboard__class-name">{c.name}</span>
                  <span className="admin-dashboard__class-meta">
                    {c.students} students
                  </span>
                </div>
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

        {/* Revenue Overview - col 3, row 2 */}
        <div className="dashboard-bento__card dashboard-bento__card--orange admin-dashboard__card--revenue">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Revenue Overview</h2>
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/coin.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">{unreadAnnouncements.length}</span>
            <span className="admin-dashboard__stat-label">Unread Announcements</span>
          </div>
          <div className="admin-dashboard__trend">
            <img src="/assets/cartoon-icons/Trail.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            <span>Live from notifications feed</span>
          </div>
          <Link
            to="/app/notifications"
            className="dashboard-bento__card-action"
            aria-label="View notifications"
          >
            View details <ArrowRight size={14} aria-hidden />
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
      </div>
    </div>
  );
}
