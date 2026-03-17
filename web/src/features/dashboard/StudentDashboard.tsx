import { Link } from "react-router-dom";
import {
  BookOpen,
  Trophy,
  Flame,
  Target,
  Star,
  ArrowRight,
  Sparkles,
  Users,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useUIMode } from "../../providers/UIModeProvider";
import { useTenant } from "../../providers/TenantProvider";
import "./dashboard-bento.css";
import "./student-dashboard.css";

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker", path: "/playground/circuit-maker" },
  { id: "micro-maker", name: "Micro Maker", path: "/playground/micro-maker" },
  { id: "gamedev", name: "Game Dev", path: "/playground/gamedev" },
  { id: "python-game", name: "Python Game", path: "/playground/python-game" },
  { id: "game-maker", name: "Game Maker", path: "/playground/game-maker" },
  { id: "design-maker", name: "Design Maker", path: "/playground/design-maker" },
];

const BADGES = [
  { id: "first-circuit", label: "First Circuit", icon: Star },
  { id: "code-ninja", label: "Code Ninja", icon: Target },
  { id: "3d-architect", label: "3D Architect", icon: Trophy },
  { id: "week-streak", label: "Week Streak", icon: Flame },
];

const LEADERBOARD = [
  { rank: 1, name: "Alex", xp: 1200 },
  { rank: 2, name: "Maya", xp: 980 },
  { rank: 3, name: "You", xp: 720 },
];

export function StudentDashboard() {
  const { user } = useAuth();
  useUIMode();
  useTenant();

  const firstName = user?.firstName ?? "Student";
  const streak = 5;
  const xp = 720;
  const xpMax = 1000;
  const level = 7;
  const xpPercent = Math.min(100, (xp / xpMax) * 100);

  return (
    <div className="dashboard-bento student-dashboard" role="main" aria-label="Student dashboard">
      <header className="dashboard-bento__header">
        <div className="student-dashboard__header-row">
          <div>
            <h1 className="dashboard-bento__greeting">Hi, {firstName}!</h1>
            <p className="dashboard-bento__subtitle">Your STEM learning world</p>
          </div>
          <div className="student-dashboard__header-stats">
            <div className="dashboard-bento__streak" aria-label={`${streak} day streak`}>
              <Flame size={20} aria-hidden />
              <span>{streak}</span>
            </div>
            <div className="student-dashboard__level">Level {level}</div>
          </div>
        </div>
        <div className="student-dashboard__xp-wrap">
          <div className="student-dashboard__xp-labels">
            <span>{xp} XP</span>
            <span>{xpMax} XP</span>
          </div>
          <div
            className="dashboard-bento__xp-bar"
            role="progressbar"
            aria-valuenow={xp}
            aria-valuemin={0}
            aria-valuemax={xpMax}
            aria-label="Experience progress"
          >
            <div className="dashboard-bento__xp-fill" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>
      </header>

      <div className="dashboard-bento__grid">
        {/* Continue Learning - large */}
        <Link
          to="/app/labs"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--green"
          aria-label="Continue to Lesson 4: Build a Traffic Light"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(88, 204, 2, 0.15)", color: "#58cc02" }}>
              <BookOpen size={24} aria-hidden />
            </div>
            <Sparkles size={20} className="student-dashboard__sparkle" aria-hidden />
          </div>
          <h2 className="dashboard-bento__card-title">Continue Learning</h2>
          <p className="dashboard-bento__card-desc">
            Lesson 4: Build a Traffic Light — Learn to wire LEDs and resistors
          </p>
          <span className="dashboard-bento__card-action">
            Open lab <ArrowRight size={16} aria-hidden />
          </span>
        </Link>

        {/* Today's Challenge */}
        <div className="dashboard-bento__card dashboard-bento__card--orange">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(255, 150, 0, 0.15)", color: "#ff9600" }}>
              <Target size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Today&apos;s Challenge</h2>
          <p className="dashboard-bento__card-desc">Complete 3 circuits to earn bonus XP</p>
          <Link to="/app/labs" className="dashboard-bento__card-action">
            Start <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Rewards & Badges */}
        <div className="dashboard-bento__card dashboard-bento__card--purple">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(206, 130, 255, 0.15)", color: "#ce82ff" }}>
              <Trophy size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Rewards & Badges</h2>
          <div className="dashboard-bento__badges" role="list" aria-label="Earned badges">
            {BADGES.map((badge) => (
              <div key={badge.id} className="dashboard-bento__badge" role="listitem" title={badge.label}>
                <badge.icon size={22} aria-hidden />
              </div>
            ))}
          </div>
          <Link to="/app/achievements" className="dashboard-bento__card-action">
            View all <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* My Projects - span 2 */}
        <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--blue">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(28, 176, 246, 0.15)", color: "#1cb0f6" }}>
              <Sparkles size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">My Projects</h2>
          <p className="dashboard-bento__card-desc">Your labs and creative workspaces</p>
          <div className="student-dashboard__lab-chips">
            {LABS.slice(0, 4).map((lab) => (
              <Link key={lab.id} to={lab.path} className="student-dashboard__lab-chip">
                {lab.name}
              </Link>
            ))}
          </div>
          <Link to="/app/labs" className="dashboard-bento__card-action">
            Open all labs <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Leaderboard */}
        <div className="dashboard-bento__card dashboard-bento__card--row-2 dashboard-bento__card--green">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(88, 204, 2, 0.15)", color: "#58cc02" }}>
              <Users size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Leaderboard</h2>
          <ul className="dashboard-bento__activity-list" role="list">
            {LEADERBOARD.map((row) => (
              <li key={row.rank} className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">
                  #{row.rank} {row.name}
                </span>
                <span className="dashboard-bento__activity-time">{row.xp} XP</span>
              </li>
            ))}
          </ul>
          <span className="dashboard-bento__card-action">Keep going!</span>
        </div>

        {/* Upcoming Class */}
        <Link
          to="/app/classrooms"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--blue"
          aria-label="Upcoming class: Robotics 101"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon" style={{ background: "rgba(28, 176, 246, 0.15)", color: "#1cb0f6" }}>
              <Calendar size={24} aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Upcoming Class</h2>
          <p className="dashboard-bento__card-desc">Robotics 101 · Mon 3:00 PM</p>
          <span className="dashboard-bento__card-action">
            View schedule <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
