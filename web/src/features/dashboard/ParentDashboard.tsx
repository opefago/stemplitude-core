import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  Award,
  Calendar,
  MessageSquare,
  ChevronRight,
  X,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { ProgressBar } from "../../components/ui";
import "../../components/ui/ui.css";
import "./dashboard-bento.css";
import "./parent-dashboard.css";

const CHILDREN = [
  { id: "alex", name: "Alex" },
  { id: "maya", name: "Maya" },
];

const UPCOMING_SESSIONS = [
  { id: "1", title: "Robotics 101", time: "Mon 3pm" },
  { id: "2", title: "Game Dev", time: "Wed 2pm" },
  { id: "3", title: "Circuit Design", time: "Thu 10am" },
];

const RECENT_ACTIVITY = [
  { id: "1", text: "Completed Lesson 3: LED Circuits", time: "yesterday" },
  { id: "2", text: "Earned 'Code Ninja' badge", time: "2 days ago" },
  { id: "3", text: "Submitted Robot Arm project", time: "3 days ago" },
  { id: "4", text: "Attended Robotics 101", time: "4 days ago" },
];

const RECENT_ACHIEVEMENTS = [
  { id: "1", name: "Code Ninja", icon: "🥷" },
  { id: "2", name: "Circuit Master", icon: "⚡" },
  { id: "3", name: "5-Day Streak", icon: "🔥" },
];

const INSTRUCTOR_MESSAGES = [
  {
    id: "1",
    from: "Ms. Chen",
    subject: "Great progress on Circuit Design!",
    preview: "Alex has been doing wonderfully in class...",
    unread: true,
  },
  {
    id: "2",
    from: "Mr. Torres",
    subject: "Robotics 101 - Session reminder",
    preview: "Reminder: Robotics session tomorrow at 3pm...",
    unread: true,
  },
];

export function ParentDashboard() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [activeChildId, setActiveChildId] = useState(CHILDREN[0].id);

  const firstName = user?.firstName ?? "Parent";
  const tenantName = tenant?.name ?? "";

  const handleCancelSession = (sessionTitle: string) => {
    alert(`Cancel session "${sessionTitle}"? (Placeholder - no action)`);
  };

  return (
    <div
      className="dashboard-bento parent-dashboard"
      role="main"
      aria-label="Parent dashboard"
    >
      <header className="dashboard-bento__header parent-dashboard__header-row">
        <div>
          <h1 className="dashboard-bento__greeting">
            Hi, {firstName}!
            {tenantName && (
              <span className="parent-dashboard__tenant"> · {tenantName}</span>
            )}
          </h1>
          <p className="dashboard-bento__subtitle">
            View your children's progress and upcoming sessions
          </p>
        </div>
        <div
          className="parent-dashboard__child-switcher"
          role="tablist"
          aria-label="Select child"
        >
          {CHILDREN.map((child) => (
            <button
              key={child.id}
              role="tab"
              aria-selected={activeChildId === child.id}
              aria-controls={`child-panel-${child.id}`}
              id={`child-tab-${child.id}`}
              className={`parent-dashboard__child-tab ${
                activeChildId === child.id
                  ? "parent-dashboard__child-tab--active"
                  : ""
              }`}
              onClick={() => setActiveChildId(child.id)}
            >
              {child.name}
            </button>
          ))}
        </div>
      </header>

      {CHILDREN.map((child) => (
        <div
          key={child.id}
          id={`child-panel-${child.id}`}
          role="tabpanel"
          aria-labelledby={`child-tab-${child.id}`}
          hidden={activeChildId !== child.id}
          className="parent-dashboard__panel"
        >
          <div className="dashboard-bento__grid">
            {/* Child Progress - large */}
            <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--green">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Child Progress</h2>
                <div
                  className="dashboard-bento__card-icon"
                  style={{
                    background: "color-mix(in srgb, #58cc02 15%, transparent)",
                    color: "#58cc02",
                  }}
                >
                  <TrendingUp size={24} aria-hidden />
                </div>
              </div>
              <div className="parent-dashboard__progress-main">
                <ProgressBar
                  value={72}
                  label="Overall progress"
                  showPercent
                  variant="xp"
                />
              </div>
              <div className="parent-dashboard__progress-stats">
                <div className="dashboard-bento__streak">
                  <Flame size={18} aria-hidden />
                  5 day streak
                </div>
                <span className="parent-dashboard__stat">Level 7</span>
                <span className="parent-dashboard__stat">
                  <Award size={18} aria-hidden /> Recent grade: A
                </span>
              </div>
            </div>

            {/* Upcoming Classes */}
            <div className="dashboard-bento__card dashboard-bento__card--orange">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Upcoming Classes</h2>
                <Link
                  to="/app/classrooms"
                  className="dashboard-bento__card-action"
                  aria-label="View all classes"
                >
                  View all <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <ul className="dashboard-bento__activity-list" role="list">
                {UPCOMING_SESSIONS.map((session) => (
                  <li
                    key={session.id}
                    className="parent-dashboard__session-row"
                    role="listitem"
                  >
                    <Calendar size={16} aria-hidden />
                    <span className="parent-dashboard__session-text">
                      {session.title} – {session.time}
                    </span>
                    <button
                      type="button"
                      className="parent-dashboard__session-cancel"
                      onClick={() => handleCancelSession(session.title)}
                      aria-label={`Cancel ${session.title} session`}
                    >
                      <X size={12} aria-hidden /> Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Teacher Messages */}
            <Link
              to="/app/messages"
              className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--blue dashboard-bento__card--row-2"
              aria-label="Teacher messages"
            >
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Teacher Messages</h2>
                <div
                  className="dashboard-bento__card-icon"
                  style={{
                    background: "color-mix(in srgb, #1cb0f6 15%, transparent)",
                    color: "#1cb0f6",
                  }}
                >
                  <MessageSquare size={24} aria-hidden />
                </div>
              </div>
              <div className="parent-dashboard__messages-preview">
                {INSTRUCTOR_MESSAGES.map((msg) => (
                  <div
                    key={msg.id}
                    className={`parent-dashboard__message-preview ${
                      msg.unread ? "parent-dashboard__message-preview--unread" : ""
                    }`}
                  >
                    <span className="parent-dashboard__message-from">
                      {msg.from}
                      {msg.unread && (
                        <span
                          className="parent-dashboard__message-unread"
                          aria-label="Unread"
                        />
                      )}
                    </span>
                    <p className="parent-dashboard__message-text">{msg.preview}</p>
                  </div>
                ))}
              </div>
              <span className="dashboard-bento__card-action">
                View all messages <ChevronRight size={14} aria-hidden />
              </span>
            </Link>

            {/* Recent Achievements */}
            <div className="dashboard-bento__card dashboard-bento__card--purple">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">
                  Recent Achievements
                </h2>
              </div>
              <div className="dashboard-bento__badges">
                {RECENT_ACHIEVEMENTS.map((a) => (
                  <div
                    key={a.id}
                    className="dashboard-bento__badge parent-dashboard__achievement-badge"
                    title={a.name}
                  >
                    {a.icon}
                  </div>
                ))}
              </div>
              <Link
                to="/app/achievements"
                className="dashboard-bento__card-action"
                aria-label="View all achievements"
              >
                View all <ChevronRight size={14} aria-hidden />
              </Link>
            </div>

            {/* Activity Timeline */}
            <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--red">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Activity Timeline</h2>
                <Link
                  to="/app/activity"
                  className="dashboard-bento__card-action"
                  aria-label="View full activity"
                >
                  View all <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <ul className="dashboard-bento__activity-list" role="list">
                {RECENT_ACTIVITY.map((item) => (
                  <li
                    key={item.id}
                    className="dashboard-bento__activity-item"
                    role="listitem"
                  >
                    <span className="dashboard-bento__activity-text">
                      {item.text}
                    </span>
                    <span className="dashboard-bento__activity-time">
                      {item.time}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
