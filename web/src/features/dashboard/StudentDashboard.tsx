import { useCallback, useEffect, useMemo, useState } from "react";
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
  Video,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useUIMode } from "../../providers/UIModeProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getMyActiveSessions,
  getMyAssignments,
  getMyClassrooms,
  getMyUpcomingSessions,
  type StudentAssignment,
  type SessionResponse,
} from "../../lib/api/students";
import type { ClassroomRecord } from "../../lib/api/classrooms";
import {
  getMyGamificationProfile,
  getLeaderboard,
  getCurrentWeekWinners,
  iconSlugToEmoji,
  winnerSeenKey,
  type GamificationProfile,
  type LeaderboardEntry,
  type WeeklyWinner,
} from "../../lib/api/gamification";
import { WeeklyWinnerBanner } from "../gamification/WeeklyWinnerBanner";
import { WeeklyWinnerModal } from "../gamification/WeeklyWinnerModal";
import "../gamification/gamification.css";
import "./dashboard-bento.css";
import "./student-dashboard.css";

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker", path: "/playground/circuit-maker" },
  { id: "micro-maker", name: "Micro Maker", path: "/playground/micro-maker" },
  { id: "python-game", name: "Python Game Maker", path: "/playground/python-game" },
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
  const { tenant } = useTenant();
  const [upcomingSessions, setUpcomingSessions] = useState<SessionResponse[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionResponse[]>([]);
  const [myClassrooms, setMyClassrooms] = useState<ClassroomRecord[]>([]);
  const [myAssignments, setMyAssignments] = useState<StudentAssignment[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [gamification, setGamification] = useState<GamificationProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [weekWinners, setWeekWinners] = useState<WeeklyWinner[]>([]);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const firstName = user?.firstName?.trim() || user?.lastName?.trim() || "Student";
  const xp = gamification?.total_xp ?? 0;
  const xpMax = gamification?.xp_end ?? 100;
  const level = gamification?.level ?? 1;
  const levelName = gamification?.level_name ?? "Explorer";
  const streak = gamification?.streak.current_streak ?? 0;
  const xpPercent = Math.min(100, ((xp - (gamification?.xp_start ?? 0)) / Math.max(1, xpMax - (gamification?.xp_start ?? 0))) * 100);
  const classroomNameById = useMemo(
    () =>
      new Map(
        myClassrooms.map((classroom) => [
          classroom.id,
          classroom.name || "Classroom session",
        ]),
      ),
    [myClassrooms],
  );

  const tenantId = tenant?.id ?? user?.tenantId;

  const refreshSessionsFromServer = useCallback(async () => {
    try {
      const [sessions, active, classrooms, assignments] = await Promise.all([
        getMyUpcomingSessions(6),
        getMyActiveSessions(4),
        getMyClassrooms().catch(() => []),
        getMyAssignments(50).catch(() => []),
      ]);
      setUpcomingSessions(sessions);
      setActiveSessions(active);
      setMyClassrooms(classrooms);
      setMyAssignments(assignments);
    } catch {
      setUpcomingSessions([]);
      setActiveSessions([]);
      setMyClassrooms([]);
      setMyAssignments([]);
    }
  }, []);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: refreshSessionsFromServer,
  });

  useEffect(() => {
    let mounted = true;
    async function loadUpcoming() {
      setLoadingUpcoming(true);
      try {
        const [sessions, active, classrooms, assignments] = await Promise.all([
          getMyUpcomingSessions(6),
          getMyActiveSessions(4),
          getMyClassrooms().catch(() => []),
          getMyAssignments(50).catch(() => []),
        ]);
        if (!mounted) return;
        setUpcomingSessions(sessions);
        setActiveSessions(active);
        setMyClassrooms(classrooms);
        setMyAssignments(assignments);
      } catch {
        if (!mounted) return;
        setUpcomingSessions([]);
        setActiveSessions([]);
        setMyClassrooms([]);
        setMyAssignments([]);
      } finally {
        if (mounted) setLoadingUpcoming(false);
      }
    }
    void loadUpcoming();

    // Load gamification data in parallel
    getMyGamificationProfile().then((g) => { if (mounted) setGamification(g); }).catch(() => {});
    getLeaderboard(5).then((r) => { if (mounted) setLeaderboard(r.entries); }).catch(() => {});
    getCurrentWeekWinners().then((winners) => {
      if (!mounted || !winners.length) return;
      const seenKey = winnerSeenKey(winners[0].week_start);
      if (!localStorage.getItem(seenKey)) {
        setWeekWinners(winners);
        setShowBanner(true);
        setShowModal(true);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const nextDueAssignment = useMemo(
    () =>
      myAssignments.find((item) => {
        if (!item.due_at) return false;
        return new Date(item.due_at).getTime() >= Date.now();
      }) ?? myAssignments[0],
    [myAssignments],
  );

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
              <img src="/assets/cartoon-icons/Thunder.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
              <span>{streak}</span>
            </div>
            <div className="student-dashboard__level">Lv.{level} {levelName}</div>
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

      {showBanner && (
        <WeeklyWinnerBanner
          winners={weekWinners}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {showModal && (
        <WeeklyWinnerModal
          winners={weekWinners}
          currentStudentId={gamification?.student_id.toString()}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="dashboard-bento__grid">

        {/* Rewards & Badges — top-right, high visibility for engagement */}
        <div className="dashboard-bento__card dashboard-bento__card--purple student-dashboard__card--rewards">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/trophy.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Rewards & Badges</h2>
          <div className="dashboard-bento__badges" role="list" aria-label="Earned badges">
            {gamification && gamification.badges.length > 0 ? (
              gamification.badges.slice(0, 4).map((sb) => (
                <div
                  key={sb.id}
                  className="dashboard-bento__badge"
                  role="listitem"
                  title={sb.badge.name}
                  style={{ color: sb.badge.color }}
                >
                  <span style={{ fontSize: "1.25rem" }}>{iconSlugToEmoji(sb.badge.icon_slug)}</span>
                </div>
              ))
            ) : (
              <p className="dashboard-bento__badges-empty">Earn badges by completing labs!</p>
            )}
          </div>
          <Link to="/app/achievements" className="dashboard-bento__card-action">
            View all <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* Active Session */}
        <div className="dashboard-bento__card dashboard-bento__card--green student-dashboard__card--active">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Controller.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Active Session</h2>
          {loadingUpcoming ? (
            <p className="dashboard-bento__card-desc">Checking active sessions...</p>
          ) : activeSessions.length === 0 ? (
            <>
              <p className="dashboard-bento__card-desc">No active class right now.</p>
              <span className="dashboard-bento__card-action">
                You can join when your instructor starts a session.
              </span>
            </>
          ) : (
            <>
              <ul className="dashboard-bento__activity-list" role="list">
                {activeSessions.slice(0, 3).map((session) => (
                  <li key={session.id} className="dashboard-bento__activity-item" role="listitem">
                    <span className="dashboard-bento__activity-text">
                      {classroomNameById.get(session.classroom_id) ?? "Classroom session"}
                    </span>
                    <Link
                      to={`/app/classrooms/${session.classroom_id}/live`}
                      className="dashboard-bento__activity-time"
                    >
                      Join session
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to={`/app/classrooms/${activeSessions[0].classroom_id}/live`}
                className="dashboard-bento__card-action"
              >
                Join active session <ArrowRight size={16} aria-hidden />
              </Link>
            </>
          )}
        </div>

        {/* Upcoming Classes */}
        <div className="dashboard-bento__card dashboard-bento__card--blue student-dashboard__card--upcoming">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Callendar.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Upcoming Classes</h2>
          {loadingUpcoming ? (
            <p className="dashboard-bento__card-desc">Loading upcoming sessions...</p>
          ) : upcomingSessions.length === 0 ? (
            <>
              {myClassrooms.length === 0 ? (
                <>
                  <p className="dashboard-bento__card-desc">No upcoming classes yet.</p>
                  <span className="dashboard-bento__card-action">
                    You will see a waiting room when a class is scheduled.
                  </span>
                </>
              ) : (
                <>
                  <p className="dashboard-bento__card-desc">You are enrolled in:</p>
                  <ul className="dashboard-bento__activity-list" role="list">
                    {myClassrooms.slice(0, 3).map((classroom) => (
                      <li key={classroom.id} className="dashboard-bento__activity-item" role="listitem">
                        <span className="dashboard-bento__activity-text">{classroom.name}</span>
                        <Link
                          to={`/app/classrooms/${classroom.id}?sessionAction=waiting`}
                          className="dashboard-bento__activity-time"
                        >
                          Open classroom
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <span className="dashboard-bento__card-action">
                    Your instructor still needs to schedule the next session.
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <ul className="dashboard-bento__activity-list" role="list">
                {upcomingSessions.map((session) => (
                  <li key={session.id} className="dashboard-bento__activity-item" role="listitem">
                    <span className="dashboard-bento__activity-text">
                      Classroom session
                    </span>
                    <span className="dashboard-bento__activity-time">
                      {new Date(session.session_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to={`/app/classrooms/${upcomingSessions[0].classroom_id}?sessionAction=waiting`}
                className="dashboard-bento__card-action"
              >
                Open waiting room <ArrowRight size={16} aria-hidden />
              </Link>
            </>
          )}
        </div>

        {/* Leaderboard — tall, beside Active + Upcoming */}
        <div className="dashboard-bento__card dashboard-bento__card--green student-dashboard__card--leaderboard">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Players.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Leaderboard</h2>
          <ul className="dashboard-bento__activity-list" role="list">
            {leaderboard.length > 0 ? leaderboard.map((row) => {
              const isMe = gamification && row.student_id === gamification.student_id;
              return (
                <li
                  key={row.student_id}
                  className={`dashboard-bento__activity-item${isMe ? " dashboard-bento__activity-item--me" : ""}`}
                  role="listitem"
                >
                  <span className="dashboard-bento__activity-text">
                    {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}{" "}
                    {isMe ? "You" : row.student_name.split(" ")[0]}
                  </span>
                  <span className="dashboard-bento__activity-time">{row.total_xp} XP</span>
                </li>
              );
            }) : (
              <li className="dashboard-bento__activity-item" role="listitem">
                <span className="dashboard-bento__activity-text">Be the first on the board!</span>
              </li>
            )}
          </ul>
          <span className="dashboard-bento__card-action">Keep going! 💪</span>
        </div>

        {/* Continue Learning - assignments */}
        <Link
          to="/app/assignments"
          className="dashboard-bento__card dashboard-bento__card-link dashboard-bento__card--green student-dashboard__card--continue"
          aria-label="Open assignments page"
        >
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Books.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
            <Sparkles size={20} className="student-dashboard__sparkle" aria-hidden />
          </div>
          <h2 className="dashboard-bento__card-title">Continue Learning</h2>
          <p className="dashboard-bento__card-desc">
            {nextDueAssignment
              ? `${nextDueAssignment.title} • ${nextDueAssignment.classroom_name}`
              : "Check your due assignments and keep progressing through class work."}
          </p>
          <span className="dashboard-bento__card-action">
            Open assignments <ArrowRight size={16} aria-hidden />
          </span>
        </Link>

        {/* Today's Challenge */}
        <div className="dashboard-bento__card dashboard-bento__card--orange student-dashboard__card--challenge">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Flag.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            </div>
          </div>
          <h2 className="dashboard-bento__card-title">Today&apos;s Challenge</h2>
          <p className="dashboard-bento__card-desc">Complete 3 circuits to earn bonus XP</p>
          <Link to="/app/labs" className="dashboard-bento__card-action">
            Start <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {/* My Projects */}
        <div className="dashboard-bento__card dashboard-bento__card--blue student-dashboard__card--projects">
          <div className="dashboard-bento__card-header">
            <div className="dashboard-bento__card-icon">
              <img src="/assets/cartoon-icons/Chest2.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
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

      </div>
    </div>
  );
}
