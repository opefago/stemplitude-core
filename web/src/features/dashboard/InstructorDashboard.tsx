import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  BookOpen,
  MessageSquare,
  FileEdit,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import {
  createClassroomSession,
  listClassroomSessions,
  listClassrooms,
  type ClassroomSessionRecord,
} from "../../lib/api/classrooms";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import "./dashboard-bento.css";
import "./instructor-dashboard.css";

const RECENT_ACTIVITY = [
  { id: 1, text: "Alex completed Lab 3", time: "2 hours ago" },
  { id: 2, text: "Maya submitted Circuit project", time: "3 hours ago" },
  { id: 3, text: "Jordan started Game Maker module", time: "5 hours ago" },
];

export function InstructorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [upcoming, setUpcoming] = useState<
    Array<{ classroomId: string; classroomName: string; session: ClassroomSessionRecord }>
  >([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [startingClassId, setStartingClassId] = useState<string | null>(null);

  const firstName = user?.firstName ?? "Instructor";
  const tenantName = tenant?.name ?? "Your School";
  const tenantId = tenant?.id ?? user?.tenantId;

  const loadUpcoming = useCallback(async () => {
    setLoadingUpcoming(true);
    try {
      const classrooms = await listClassrooms({ limit: 12, is_active: true });
      const byClass = await Promise.all(
        classrooms.map(async (c) => ({
          classroomId: c.id,
          classroomName: c.name,
          sessions: await listClassroomSessions(c.id, 12),
        })),
      );
      const now = Date.now();
      const items = byClass
        .flatMap((c) =>
          c.sessions
            .filter((s) => s.status !== "canceled" && new Date(s.session_start).getTime() >= now)
            .map((s) => ({ classroomId: c.classroomId, classroomName: c.classroomName, session: s })),
        )
        .sort(
          (a, b) =>
            new Date(a.session.session_start).getTime() - new Date(b.session.session_start).getTime(),
        )
        .slice(0, 6);
      setUpcoming(items);
    } catch {
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  }, []);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: loadUpcoming,
    onNotificationsInvalidate: loadUpcoming,
    onMessagesInvalidate: loadUpcoming,
  });

  const nextClassroom = useMemo(() => upcoming[0], [upcoming]);

  const handleStartClass = async () => {
    if (!nextClassroom) return;
    setStartingClassId(nextClassroom.classroomId);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await createClassroomSession(nextClassroom.classroomId, {
        session_start: start.toISOString(),
        session_end: end.toISOString(),
        notes: "Started from instructor dashboard",
      });
      navigate(`/app/classrooms/${nextClassroom.classroomId}`);
    } finally {
      setStartingClassId(null);
    }
  };

  return (
    <div
      className="dashboard-bento instructor-dashboard"
      role="main"
      aria-label="Instructor dashboard"
    >
      <header className="dashboard-bento__header">
        <h1 className="dashboard-bento__greeting">Welcome back, {firstName}</h1>
        <p className="dashboard-bento__subtitle">{tenantName}</p>
      </header>

      <div className="dashboard-bento__grid">
        {/* Today's Classes - large */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--blue">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <Calendar size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Upcoming Classes</h2>
          <p className="dashboard-bento__card-desc">
            {loadingUpcoming ? "Loading classes..." : `${upcoming.length} sessions coming up`}
          </p>
          {loadingUpcoming ? (
            <p className="dashboard-bento__activity-time">Fetching scheduled sessions...</p>
          ) : upcoming.length === 0 ? (
            <p className="dashboard-bento__activity-time">No upcoming sessions. Start a class from your classroom page.</p>
          ) : (
            <ul className="dashboard-bento__activity-list" role="list">
              {upcoming.map((entry) => (
                <li key={entry.session.id} className="dashboard-bento__activity-item" role="listitem">
                  <span className="dashboard-bento__activity-text">
                    {entry.classroomName}
                  </span>
                  <span className="dashboard-bento__activity-time">
                    {new Date(entry.session.session_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {nextClassroom && (
            <button
              type="button"
              className="dashboard-bento__card-action"
              onClick={handleStartClass}
              disabled={startingClassId === nextClassroom.classroomId}
            >
              {startingClassId === nextClassroom.classroomId ? "Starting..." : "Start class now"}
              <ArrowRight size={16} aria-hidden />
            </button>
          )}
          <Link to="/app/classrooms" className="dashboard-bento__card-action">
            View all <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Course Builder */}
        <Link
          to="/app/curriculum"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--green"
          aria-label="Course Builder"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <FileEdit size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Course Builder</h2>
          <p className="dashboard-bento__card-desc">
            Create and edit lessons
          </p>
          <span className="dashboard-bento__card-action">
            Open <ArrowRight size={16} aria-hidden />
          </span>
        </Link>

        {/* Student Activity */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--purple">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <Users size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Student Activity</h2>
          <p className="dashboard-bento__card-desc">
            Recent completions and submissions
          </p>
          <ul className="dashboard-bento__activity-list" role="list">
            {RECENT_ACTIVITY.map((item) => (
              <li key={item.id} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">{item.text}</span>
                <span className="dashboard-bento__activity-time">{item.time}</span>
              </li>
            ))}
          </ul>
          <Link to="/app/students" className="dashboard-bento__card-action">
            View students <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Messages from Students */}
        <Link
          to="/app/messages"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--row-2 dashboard-bento__card--orange"
          aria-label="Messages from students"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <MessageSquare size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Messages</h2>
          <p className="dashboard-bento__card-desc">
            3 unread from students
          </p>
          <span className="dashboard-bento__card-action">
            Open inbox <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
