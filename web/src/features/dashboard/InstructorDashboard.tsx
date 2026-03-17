import { Link } from "react-router-dom";
import {
  Users,
  GraduationCap,
  BookOpen,
  MessageSquare,
  ClipboardList,
  FileEdit,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import "./dashboard-bento.css";
import "./instructor-dashboard.css";

const TODAYS_CLASSES = [
  { id: "1", name: "Robotics 101", time: "3:00 PM", students: 12 },
  { id: "2", name: "Game Dev 201", time: "4:30 PM", students: 8 },
];

const RECENT_ACTIVITY = [
  { id: 1, text: "Alex completed Lab 3", time: "2 hours ago" },
  { id: 2, text: "Maya submitted Circuit project", time: "3 hours ago" },
  { id: 3, text: "Jordan started Game Dev module", time: "5 hours ago" },
];

export function InstructorDashboard() {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const firstName = user?.firstName ?? "Instructor";
  const tenantName = tenant?.name ?? "Your School";

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
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(28, 176, 246, 0.15)", color: "#1cb0f6" }}>
              <Calendar size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Today&apos;s Classes</h2>
          <p className="dashboard-bento__card-desc">
            {TODAYS_CLASSES.length} classes scheduled
          </p>
          <ul className="dashboard-bento__activity-list" role="list">
            {TODAYS_CLASSES.map((cls) => (
              <li key={cls.id} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">
                  {cls.name} · {cls.time}
                </span>
                <span className="dashboard-bento__activity-time">{cls.students} students</span>
              </li>
            ))}
          </ul>
          <Link to="/app/classrooms" className="dashboard-bento__card-action">
            View all <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Assignments to Review */}
        <Link
          to="/app/classrooms"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--red"
          aria-label="Assignments to review"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(255, 75, 75, 0.15)", color: "#ff4b4b" }}>
              <ClipboardList size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Assignments to Review</h2>
          <p className="dashboard-bento__card-desc">
            5 submissions pending
          </p>
          <span className="dashboard-bento__card-action">
            Review <ArrowRight size={16} aria-hidden />
          </span>
        </Link>

        {/* Course Builder */}
        <Link
          to="/app/curriculum"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--green"
          aria-label="Course Builder"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(88, 204, 2, 0.15)", color: "#58cc02" }}>
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
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(206, 130, 255, 0.15)", color: "#ce82ff" }}>
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
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(255, 150, 0, 0.15)", color: "#ff9600" }}>
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
