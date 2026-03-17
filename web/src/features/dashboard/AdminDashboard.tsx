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
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import "./dashboard-bento.css";
import "./admin-dashboard.css";

const ACTIVE_CLASSES = [
  { id: "1", name: "Intro to Electronics", room: "Room A", students: 12 },
  { id: "2", name: "Python Basics", room: "Room B", students: 8 },
  { id: "3", name: "Robotics Workshop", room: "Lab 1", students: 15 },
];

const INSTRUCTOR_ACTIVITY = [
  { id: "1", text: "Jordan Smith enrolled in Robotics 101", time: "2 hours ago" },
  { id: "2", text: "New instructor Alex Chen joined", time: "5 hours ago" },
  { id: "3", text: "Maya Johnson completed Circuit Basics", time: "1 day ago" },
  { id: "4", text: "Classroom 'Advanced Python' created", time: "2 days ago" },
];

const ANNOUNCEMENTS = [
  {
    id: "1",
    title: "Spring Break Schedule",
    preview: "Classes resume Monday, April 8th...",
    date: "Mar 10",
  },
  {
    id: "2",
    title: "New Robotics Lab Open",
    preview: "Lab 2 is now available for bookings...",
    date: "Mar 8",
  },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const tenantName = tenant?.name ?? "Organization";
  const greeting = user?.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";

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
          <Users size={16} aria-hidden />
          Enroll Student
        </Link>
      </header>

      <div className="dashboard-bento__grid">
        {/* Active Classes - large */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--blue">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Active Classes</h2>
            <div
              className="dashboard-bento__card-icon"
              style={{
                background: "color-mix(in srgb, #1cb0f6 15%, transparent)",
                color: "#1cb0f6",
              }}
            >
              <School size={24} aria-hidden />
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
            {ACTIVE_CLASSES.map((c) => (
              <li key={c.id} className="admin-dashboard__class-item" role="listitem">
                <div className="admin-dashboard__class-info">
                  <span className="admin-dashboard__class-name">{c.name}</span>
                  <span className="admin-dashboard__class-meta">
                    {c.students} students · {c.room}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Enrollment Numbers */}
        <div className="dashboard-bento__card dashboard-bento__card--green">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Enrollment</h2>
            <div
              className="dashboard-bento__card-icon"
              style={{
                background: "color-mix(in srgb, #58cc02 15%, transparent)",
                color: "#58cc02",
              }}
            >
              <GraduationCap size={24} aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">47</span>
            <span className="admin-dashboard__stat-label">Total Members</span>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">32</span>
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

        {/* Revenue Overview */}
        <div className="dashboard-bento__card dashboard-bento__card--orange">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Revenue Overview</h2>
            <div
              className="dashboard-bento__card-icon"
              style={{
                background: "color-mix(in srgb, #ff9600 15%, transparent)",
                color: "#ff9600",
              }}
            >
              <DollarSign size={24} aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__stat-block">
            <span className="admin-dashboard__stat-value">$2,450</span>
            <span className="admin-dashboard__stat-label">Revenue MTD</span>
          </div>
          <div className="admin-dashboard__trend">
            <TrendingUp size={16} aria-hidden />
            <span>+12% vs last month</span>
          </div>
          <Link
            to="/app/billing"
            className="dashboard-bento__card-action"
            aria-label="View billing"
          >
            View details <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        {/* Instructor Activity */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--purple">
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
            <div
              className="dashboard-bento__card-icon"
              style={{
                background: "color-mix(in srgb, #ce82ff 15%, transparent)",
                color: "#ce82ff",
              }}
            >
              <Activity size={24} aria-hidden />
            </div>
          </div>
          <ul className="dashboard-bento__activity-list" role="list">
            {INSTRUCTOR_ACTIVITY.map((item) => (
              <li key={item.id} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">{item.text}</span>
                <span className="dashboard-bento__activity-time">{item.time}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Announcements */}
        <div className="dashboard-bento__card dashboard-bento__card--red">
          <div className="dashboard-bento__card-header">
            <h2 className="dashboard-bento__card-title">Announcements</h2>
            <div
              className="dashboard-bento__card-icon"
              style={{
                background: "color-mix(in srgb, #ff4b4b 15%, transparent)",
                color: "#ff4b4b",
              }}
            >
              <Megaphone size={24} aria-hidden />
            </div>
          </div>
          <div className="admin-dashboard__announcements">
            {ANNOUNCEMENTS.map((a) => (
              <div key={a.id} className="admin-dashboard__announcement">
                <span className="admin-dashboard__announcement-date">{a.date}</span>
                <h3 className="admin-dashboard__announcement-title">{a.title}</h3>
                <p className="admin-dashboard__announcement-preview">{a.preview}</p>
              </div>
            ))}
          </div>
          <Link
            to="/app/announcements"
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
