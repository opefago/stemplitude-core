import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Trophy,
  Flame,
  Users,
  Megaphone,
  Gamepad2,
  Ellipsis,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useGuardianLearner } from "../../providers/GuardianLearnerProvider";
import { useChildContextStudentId } from "../../lib/childContext";
import { studentProfileDisplayName } from "../../lib/studentDisplayName";
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
  winnerSeenKey,
  type GamificationProfile,
  type LeaderboardEntry,
  type WeeklyWinner,
} from "../../lib/api/gamification";
import { WeeklyWinnerBanner } from "../gamification/WeeklyWinnerBanner";
import { WeeklyWinnerModal } from "../gamification/WeeklyWinnerModal";
import { AppTooltip } from "../../components/ui";
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

const LAB_LABEL_BY_ID: Record<string, string> = {
  "circuit-maker": "Circuit Maker",
  "micro-maker": "Micro Maker",
  "python-game": "Python Game Maker",
  "game-maker": "Game Maker",
  "design-maker": "Design Maker",
};

const DEMO_BADGES = [
  { id: "demo-level-1", name: "Level 1", imageSrc: "/assets/cartoon-icons/trophy.png" },
  { id: "demo-level-2", name: "Level 2", imageSrc: "/assets/cartoon-icons/Gift1.png" },
  { id: "demo-level-3", name: "Level 3", imageSrc: "/assets/cartoon-icons/coin.png" },
  { id: "demo-level-4", name: "Level 4", imageSrc: "/assets/cartoon-icons/Thunder.png" },
];

const DEMO_ANNOUNCEMENTS = [
  {
    id: "demo-announcement-1",
    title: "Challenge Week starts Monday",
    body: "Complete one lab this week to earn bonus XP and unlock a special classroom sticker.",
    link: "/app/achievements",
  },
  {
    id: "demo-announcement-2",
    title: "Classroom reminder",
    body: "Bring your latest project idea to class and get feedback from your instructor.",
    link: "/app/classrooms",
  },
];

const AVATAR_PALETTE = ["#ef4444", "#f59e0b", "#06b6d4", "#3b82f6", "#8b5cf6", "#14b8a6"];
type StreakSummaryDay = {
  date: string;
  weekday: string;
  active: boolean;
  is_today: boolean;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarColorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash << 5) - hash + id.charCodeAt(i);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function formatUpcomingSessionDueLabel(sessionStart: string): string {
  const startMs = new Date(sessionStart).getTime();
  if (Number.isNaN(startMs)) return "Date unavailable";
  const diffMs = startMs - Date.now();
  if (diffMs <= 0) return "Starting now";

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const minutes = Math.ceil(diffMs / minuteMs);
  if (minutes <= 60) {
    return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (minutes <= 120) return "In 1 hour";

  const hours = Math.ceil(diffMs / hourMs);
  if (hours < 24) {
    return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.ceil(diffMs / dayMs);
  if (days <= 7) {
    return `In ${days} day${days === 1 ? "" : "s"}`;
  }

  return `On ${new Date(startMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

/** YYYY-MM-DD for a Date interpreted in the browser's local calendar (not UTC). */
function localDateToIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format an API gamification calendar date (naive YYYY-MM-DD, same zone as calendar_tz on fetch).
 * Do not parse as UTC midnight — that shifts the day vs the streak week strip.
 */
function formatGamificationCalendarDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const local = new Date(y, mo - 1, d);
  return local.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function buildFallbackStreakSummary(currentStreak: number): StreakSummaryDay[] {
  const today = new Date();
  const capped = Math.max(0, Math.min(7, currentStreak));
  const todayWeekdayIndex = today.getDay(); // 0=Sunday ... 6=Saturday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - todayWeekdayIndex);
  const activeCountInWeek = Math.min(capped, todayWeekdayIndex + 1);
  const summary: StreakSummaryDay[] = [];
  for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + weekdayIndex);
    const isActiveDay =
      weekdayIndex <= todayWeekdayIndex &&
      weekdayIndex > todayWeekdayIndex - activeCountInWeek;
    summary.push({
      date: localDateToIsoDate(day),
      weekday: day.toLocaleDateString([], { weekday: "short" }),
      active: isActiveDay,
      is_today: weekdayIndex === todayWeekdayIndex,
    });
  }
  return summary;
}

/** Max rows in the My Classes sidebar; full list is on /app/classrooms */
const SIDEBAR_CLASS_PREVIEW_LIMIT = 2;

export function StudentDashboard() {
  const { user, subType, role } = useAuth();
  const childCtx = useChildContextStudentId();
  const guardianLearner = useGuardianLearner();
  const guardianAsLearner =
    Boolean(childCtx) &&
    subType === "user" &&
    (role === "parent" || role === "homeschool_parent");
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
  const learnerProfile = guardianLearner.activeLearnerProfile;
  const headerGreeting =
    guardianAsLearner && learnerProfile
      ? `Hi, ${studentProfileDisplayName(learnerProfile)}!`
      : guardianAsLearner
        ? "Hi!"
        : `Hi, ${firstName}!`;
  const headerSubtitle =
    guardianAsLearner && learnerProfile
      ? "Your STEM learning world"
      : guardianAsLearner
        ? "Loading learner profile…"
        : "Your STEM learning world";
  const xp = gamification?.total_xp ?? 0;
  const xpMax = gamification?.xp_end ?? 100;
  const level = gamification?.level ?? 1;
  const levelName = gamification?.level_name ?? "Explorer";
  const streak = gamification?.streak.current_streak ?? 0;
  const bestStreak = gamification?.streak.best_streak ?? 0;
  const lastStreakActivityDate = gamification?.streak.last_activity_date ?? null;
  const streakSummary = useMemo<StreakSummaryDay[]>(() => {
    const raw = gamification?.streak.seven_day_summary;
    if (raw && raw.length === 7) {
      return raw.map((day) => ({
        date: day.date,
        weekday: day.weekday,
        active: Boolean(day.active),
        is_today: Boolean(day.is_today),
      }));
    }
    return buildFallbackStreakSummary(streak);
  }, [gamification?.streak.seven_day_summary, streak]);
  const streakLastActiveLabel = useMemo(() => {
    if (!lastStreakActivityDate) return "No activity yet";
    const datePart = formatGamificationCalendarDate(lastStreakActivityDate);
    const match = streakSummary.find((s) => s.date === lastStreakActivityDate);
    return match ? `${match.weekday} ${datePart}` : datePart;
  }, [lastStreakActivityDate, streakSummary]);
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

  const sidebarClassPreview = useMemo(
    () => myClassrooms.slice(0, SIDEBAR_CLASS_PREVIEW_LIMIT),
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
    getLeaderboard(10).then((r) => { if (mounted) setLeaderboard(r.entries); }).catch(() => {});
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
  }, [childCtx]);

  const nextDueAssignment = useMemo(
    () =>
      myAssignments.find((item) => {
        if (!item.due_at) return false;
        return new Date(item.due_at).getTime() >= Date.now();
      }) ?? myAssignments[0],
    [myAssignments],
  );
  const currentSession = activeSessions[0] ?? upcomingSessions[0] ?? null;
  const hasActiveSession = activeSessions.length > 0;
  const classIdsWithActiveSession = useMemo(
    () => new Set(activeSessions.map((session) => session.classroom_id)),
    [activeSessions],
  );
  const classIdsWithUpcomingSession = useMemo(
    () => new Set(upcomingSessions.map((session) => session.classroom_id)),
    [upcomingSessions],
  );
  const upcomingSessionByClassId = useMemo(() => {
    const map = new Map<string, SessionResponse>();
    for (const session of upcomingSessions) {
      if (!map.has(session.classroom_id)) map.set(session.classroom_id, session);
    }
    return map;
  }, [upcomingSessions]);
  const todoAssignments = useMemo(() => {
    const now = Date.now();
    return myAssignments
      .filter((item) => item.due_at && new Date(item.due_at).getTime() >= now)
      .sort((a, b) => {
        const aSubmitted = a.submission_status === "submitted" ? 1 : 0;
        const bSubmitted = b.submission_status === "submitted" ? 1 : 0;
        if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      })
      .slice(0, 4);
  }, [myAssignments]);
  const focusClassroomName = currentSession
    ? classroomNameById.get(currentSession.classroom_id) ?? "Classroom session"
    : "Nothing on your schedule right now";
  const focusJoinPath = currentSession
    ? hasActiveSession
      ? `/app/classrooms/${currentSession.classroom_id}/live`
      : `/app/classrooms/${currentSession.classroom_id}?sessionAction=waiting`
    : "/app/classrooms";
  const focusJoinLabel = hasActiveSession ? "JOIN CLASS NOW" : "OPEN WAITING ROOM";
  const announcements = useMemo(() => {
    const items: Array<{ id: string; title: string; body: string; link: string }> = [];
    if (hasActiveSession && activeSessions[0]) {
      const className =
        classroomNameById.get(activeSessions[0].classroom_id) ?? "Your class";
      items.push({
        id: "class-live",
        title: `${className} is live now`,
        body: "Your instructor has started class. Join now to avoid missing important instructions.",
        link: `/app/classrooms/${activeSessions[0].classroom_id}/live`,
      });
    }
    if (upcomingSessions[0]) {
      const start = new Date(upcomingSessions[0].session_start).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      items.push({
        id: "class-upcoming",
        title: "Next class reminder",
        body: `Your next class starts ${start}. Open the waiting room early and get ready.`,
        link: `/app/classrooms/${upcomingSessions[0].classroom_id}?sessionAction=waiting`,
      });
    }
    if (weekWinners[0]) {
      items.push({
        id: "weekly-winners",
        title: "Weekly winners announced",
        body: "Celebrate classmates who earned top XP this week and keep building your streak.",
        link: "/app/achievements",
      });
    }
    return items.length > 0 ? items.slice(0, 3) : DEMO_ANNOUNCEMENTS;
  }, [
    hasActiveSession,
    activeSessions,
    upcomingSessions,
    weekWinners,
    classroomNameById,
  ]);
  const displayBadges = useMemo(() => {
    if (gamification && gamification.badges.length > 0) {
      return gamification.badges.slice(0, 3).map((sb, index) => ({
        id: String(sb.id),
        name: sb.badge.name,
        imageSrc: DEMO_BADGES[index % DEMO_BADGES.length].imageSrc,
        isDemo: false,
      }));
    }
    return DEMO_BADGES.slice(0, 3).map((badge) => ({ ...badge, isDemo: true }));
  }, [gamification]);

  return (
    <div className="dashboard-bento student-dashboard" role="main" aria-label="Student dashboard">
      <header className="dashboard-bento__header">
        <div className="student-dashboard__header-row">
          <div className="student-dashboard__header-user">
            <h1 className="dashboard-bento__greeting">{headerGreeting}</h1>
            <p className="dashboard-bento__subtitle">{headerSubtitle}</p>
          </div>

          <div className="student-dashboard__header-center">
            <div
              className="student-dashboard__streak-tooltip-wrap"
              tabIndex={0}
              aria-label={`${streak} day streak. Hover for details.`}
            >
              <div className="dashboard-bento__streak student-dashboard__header-streak" aria-hidden>
                <Flame size={20} className="student-dashboard__streak-flame-icon" aria-hidden />
                <span>{streak}</span>
              </div>
              <div className="student-dashboard__streak-tooltip" role="note">
                <p className="student-dashboard__streak-tooltip-title">{streak} day{streak === 1 ? "" : "s"} streak</p>
                <p className="student-dashboard__streak-tooltip-line">Current: {streak} day{streak === 1 ? "" : "s"}</p>
                <p className="student-dashboard__streak-tooltip-line">Best: {bestStreak} day{bestStreak === 1 ? "" : "s"}</p>
                <p className="student-dashboard__streak-tooltip-line">Last active: {streakLastActiveLabel}</p>
                <div
                  className="student-dashboard__streak-week"
                  aria-label="Current streak days in this calendar week"
                >
                  {streakSummary.map((day) => (
                    <span
                      key={day.date}
                      className={`student-dashboard__streak-day${day.active ? " student-dashboard__streak-day--active" : ""}${day.is_today ? " student-dashboard__streak-day--today" : ""}`}
                      title={`${day.weekday} ${day.date} - ${day.active ? "active" : "inactive"}`}
                    >
                      {day.weekday.slice(0, 1)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="student-dashboard__header-stats">
            <div className="dashboard-bento__streak student-dashboard__streak-mobile" aria-label={`${streak} day streak`}>
              <Flame size={20} className="student-dashboard__streak-flame-icon" aria-hidden />
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

      <div className="student-dashboard__layout">
        <aside className="student-dashboard__class-sidebar">
          <div className="student-dashboard__sidebar-title-row">
            <img src="/assets/cartoon-icons/Callendar.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
            <h2 className="student-dashboard__sidebar-title">My Classes</h2>
          </div>
          <div
            className={`student-dashboard__focus-class student-dashboard__focus-class--${hasActiveSession ? "active" : currentSession ? "upcoming" : "idle"}`}
          >
            <p className="student-dashboard__focus-kicker">
              {hasActiveSession ? "LIVE NOW" : currentSession ? "UP NEXT" : "NO ACTIVE SESSION"}
            </p>
            <h3 className="student-dashboard__focus-title">
              {loadingUpcoming ? "Loading your class..." : focusClassroomName}
            </h3>
            {currentSession && (
              <p className="student-dashboard__focus-meta">
                {hasActiveSession
                  ? "Join now and continue learning."
                  : formatUpcomingSessionDueLabel(currentSession.session_start)}
              </p>
            )}
            <Link
              to={focusJoinPath}
              className={`student-dashboard__join-cta ${hasActiveSession ? "student-dashboard__join-cta--active" : "student-dashboard__join-cta--waiting"}`}
            >
              {focusJoinLabel} <ArrowRight size={18} aria-hidden />
            </Link>
          </div>

          <div className="student-dashboard__class-list" role="list" aria-label="My classes">
            <div className="student-dashboard__class-list-scroll">
              {myClassrooms.length > 0 ? (
                sidebarClassPreview.map((classroom) => {
                  const hasActive = classIdsWithActiveSession.has(classroom.id);
                  const hasUpcoming = classIdsWithUpcomingSession.has(classroom.id);
                  const label = hasActive ? "Active" : hasUpcoming ? "Upcoming" : "Classroom";
                  const classAction = `/app/classrooms/${classroom.id}`;
                  const upcomingSession = upcomingSessionByClassId.get(classroom.id);
                  const dueLabel = hasUpcoming && upcomingSession
                    ? formatUpcomingSessionDueLabel(upcomingSession.session_start)
                    : null;
                  const classDisplayName = classroom.name?.trim() || "Classroom session";
                  return (
                    <li key={classroom.id} className="student-dashboard__class-item" role="listitem">
                      <AppTooltip title={classDisplayName} placement="top">
                        <span className="student-dashboard__class-tooltip-anchor">
                          <Link to={classAction} className="student-dashboard__class-link">
                            <span className="student-dashboard__class-main">
                              <span className="student-dashboard__class-name">{classDisplayName}</span>
                              {dueLabel ? <span className="student-dashboard__class-due">{dueLabel}</span> : null}
                            </span>
                            <span className={`student-dashboard__class-tag student-dashboard__class-tag--${hasActive ? "active" : hasUpcoming ? "upcoming" : "idle"}`}>
                              {label}
                            </span>
                          </Link>
                        </span>
                      </AppTooltip>
                    </li>
                  );
                })
              ) : (
                <li className="student-dashboard__class-item">
                  <span className="student-dashboard__empty">You are not enrolled in any class yet. Ask your teacher for an invite.</span>
                </li>
              )}
            </div>
          </div>
          <Link to="/app/classrooms" className="dashboard-bento__card-action">
            View classes <ArrowRight size={16} aria-hidden />
          </Link>

          <div className="dashboard-bento__card dashboard-bento__card--orange student-dashboard__sidebar-assignments">
            <div className="student-dashboard__card-heading">
              <div className="dashboard-bento__card-icon">
                <img src="/assets/cartoon-icons/Books.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
              </div>
              <h2 className="dashboard-bento__card-title">To Do</h2>
            </div>
            <div className="student-dashboard__sidebar-assignments-body">
            {todoAssignments.length > 0 ? (
                <ul className="student-dashboard__todo-list" role="list">
                {todoAssignments.map((assignment) => (
                    <li key={assignment.id} className="student-dashboard__todo-item" role="listitem">
                      <div className="student-dashboard__todo-main">
                        <span className="student-dashboard__todo-title">{assignment.title}</span>
                        <span className="student-dashboard__todo-meta">
                          {assignment.due_at
                            ? new Date(assignment.due_at).toLocaleDateString([], { month: "short", day: "numeric" })
                            : "No due date"}{" "}
                        • {assignment.lab_id ? (LAB_LABEL_BY_ID[assignment.lab_id] ?? assignment.lab_id) : assignment.classroom_name}
                        </span>
                      </div>
                    {assignment.submission_status === "submitted" ? (
                      <span className="student-dashboard__todo-done">Done</span>
                    ) : (
                      <Link
                        to={`/app/assignments?assignmentId=${assignment.id}`}
                        className="student-dashboard__todo-start"
                      >
                        Start
                      </Link>
                    )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dashboard-bento__card-desc">
                  No upcoming assignments right now. You are all caught up.
                </p>
              )}
            </div>
            <Link to="/app/assignments" className="dashboard-bento__card-action">
              View assignments <ArrowRight size={16} aria-hidden />
            </Link>
          </div>

        </aside>

        <section className="dashboard-bento__grid student-dashboard__main-grid">
          <div className="dashboard-bento__card dashboard-bento__card--purple student-dashboard__card--rewards">
            <div className="student-dashboard__card-heading">
              <div className="dashboard-bento__card-icon">
                <Trophy size={22} aria-hidden />
              </div>
              <h2 className="dashboard-bento__card-title">Rewards & Stickers</h2>
            </div>
            <div className="student-dashboard__badges-strip" role="list" aria-label="Earned stickers">
              {displayBadges.map((badge) => (
                <div
                  key={badge.id}
                  className={`student-dashboard__badge-chip${badge.isDemo ? " student-dashboard__badge-chip--demo" : ""}`}
                  role="listitem"
                  title={badge.name}
                >
                  <div className="student-dashboard__badge-image-wrap">
                    <img src={badge.imageSrc} alt="" className="student-dashboard__badge-image" aria-hidden />
                  </div>
                  <span className="student-dashboard__badge-name">{badge.name}</span>
                </div>
              ))}
            </div>
            <Link to="/app/achievements" className="dashboard-bento__card-action">
              Open achievements <ArrowRight size={16} aria-hidden />
            </Link>
          </div>

          <div className="dashboard-bento__card dashboard-bento__card--green student-dashboard__card--leaderboard">
          <div className="student-dashboard__card-heading">
            <div className="dashboard-bento__card-icon">
              <Users size={22} aria-hidden />
            </div>
            <h2 className="dashboard-bento__card-title">Leaderboard</h2>
          </div>
          <ul className="dashboard-bento__activity-list" role="list">
            {leaderboard.length > 0 ? leaderboard.map((row) => {
              const isMe = gamification && row.student_id === gamification.student_id;
              const displayName = isMe ? "You" : row.student_name;
              return (
                <li
                  key={row.student_id}
                  className={`student-dashboard__leader-row${isMe ? " student-dashboard__leader-row--me" : ""}`}
                  role="listitem"
                >
                  <div className="student-dashboard__leader-left">
                    <span
                      className="student-dashboard__leader-avatar"
                      style={{ backgroundColor: avatarColorFromId(row.student_id) }}
                    >
                      {initialsFromName(displayName)}
                    </span>
                    <span className="student-dashboard__leader-meta">
                      <span className="student-dashboard__leader-name">{displayName}</span>
                      <span className="student-dashboard__leader-sub">#{row.rank} • {row.total_xp} XP</span>
                    </span>
                  </div>
                  <span className="student-dashboard__leader-actions">
                    <button type="button" className="student-dashboard__leader-btn" aria-label="Challenge student">
                      <Gamepad2 size={14} aria-hidden />
                    </button>
                    <button type="button" className="student-dashboard__leader-btn" aria-label="More actions">
                      <Ellipsis size={14} aria-hidden />
                    </button>
                  </span>
                </li>
              );
            }) : (
              <li className="student-dashboard__leader-row" role="listitem">
                <span className="dashboard-bento__activity-text">Be the first on the board!</span>
              </li>
            )}
          </ul>
          <span className="dashboard-bento__card-action">
            {leaderboard.length > 0 ? "Keep going! 💪" : "Complete a lab to appear on the leaderboard."}
          </span>
          </div>

          <div className="dashboard-bento__card dashboard-bento__card--orange student-dashboard__card--announcements">
            <div className="student-dashboard__card-heading">
              <div className="dashboard-bento__card-icon">
                <Megaphone size={22} aria-hidden />
              </div>
              <h2 className="dashboard-bento__card-title">Announcements</h2>
            </div>
            {announcements.length > 0 ? (
              <ul className="student-dashboard__announcements" role="list">
                {announcements.map((item) => (
                  <li key={item.id} className="student-dashboard__announcement-item" role="listitem">
                    <p className="student-dashboard__announcement-title">{item.title}</p>
                    <p className="student-dashboard__announcement-body">{item.body}</p>
                    <Link to={item.link} className="student-dashboard__announcement-link">
                      Open <ArrowRight size={14} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-bento__card-desc">
                No announcements right now. You will see class updates and reminders here.
              </p>
            )}
          </div>

        </section>
      </div>
    </div>
  );
}
