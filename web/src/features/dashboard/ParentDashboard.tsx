import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  MessageSquareText,
  Settings,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getParentChildActivity,
  getParentChildAttendanceOverview,
  getParentChildAssignmentGrades,
  getParentChildAssignments,
  getParentChildren,
  getParentChildrenSessions,
  sessionStartBeforeExclusiveRollingDaysFromNow,
  type GuardianAttendanceOverview,
  type GuardianExcusalSummary,
  type ParentChildActivity,
  type ParentChildAssignmentGrades,
  type SessionResponse,
  type StudentAssignment,
  type StudentProfile,
} from "../../lib/api/students";
import { getStudentSummary, type ProgressSummary } from "../../lib/api/progress";
import {
  getStudentGamificationProfile,
  type GamificationProfile,
} from "../../lib/api/gamification";
import { AppTooltip, ProgressBar } from "../../components/ui";
import { ParentChildSwitcherDropdown } from "../parent/ParentChildSwitcherDropdown";
import {
  GuardianExcusalRequestModal,
  type GuardianExcusalPreset,
} from "../parent/GuardianExcusalRequestModal";
import { useGuardianMemberBillingSummary } from "../../hooks/useGuardianMemberBillingSummary";
import "../../components/ui/ui.css";
import "./dashboard-bento.css";
import "./parent-dashboard.css";

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || "Student";
}

function overallProgressPercent(summary: ProgressSummary | null): number {
  if (!summary) return 0;
  const lt = summary.lessons_total ?? summary.total_lessons ?? 0;
  const lc = summary.lessons_completed ?? summary.completed_lessons ?? 0;
  const bt = summary.labs_total ?? summary.total_labs ?? 0;
  const bc = summary.labs_completed ?? summary.completed_labs ?? 0;
  const denom = lt + bt;
  if (denom <= 0) return 0;
  return Math.round(((lc + bc) / denom) * 100);
}

function formatActivityWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const ACTIVITY_PREVIEW = 4;

/** Parent dashboard “Upcoming this week”: rolling window and max rows. */
const UPCOMING_CLASSES_WEEK_DAYS = 7;
const UPCOMING_CLASSES_MAX = 3;
const UPCOMING_ASSIGNMENTS_MAX = 5;
const ATTENDANCE_SNAPSHOT_MAX = 5;

function formatSessionRow(s: SessionResponse): string {
  try {
    const d = new Date(s.session_start);
    const when = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const cls = (s.classroom_name ?? "").trim();
    return cls ? `${cls} · ${when}` : `Session · ${when}`;
  } catch {
    return "Upcoming session";
  }
}

function formatAssignmentDueLine(item: StudentAssignment): string {
  try {
    const d = new Date(item.due_at ?? item.session_end);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function assignmentStatusShort(status?: string | null): string {
  if (status === "submitted") return "Done";
  if (status === "draft") return "Draft";
  return "To do";
}

function assignmentDueTs(item: StudentAssignment): number {
  return item.due_at
    ? new Date(item.due_at).getTime()
    : new Date(item.session_end).getTime();
}

function excusalStatusLabel(status: string): string {
  if (status === "pending") return "Excuse sent";
  if (status === "approved") return "Excusal approved";
  if (status === "denied") return "Excusal denied";
  return "Excusal sent";
}

function attendanceStatusLabel(status?: string | null): string {
  if (!status) return "No mark yet";
  return status.replace(/_/g, " ");
}

function formatAttendanceSessionMeta(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const day = start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const startTime = start.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const endTime = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${day} · ${startTime} - ${endTime}`;
  } catch {
    return startIso;
  }
}

function attendanceStatusTone(status?: string | null): string {
  const v = (status ?? "").trim().toLowerCase();
  if (!v) return "unmarked";
  if (v === "present") return "present";
  if (v === "excused") return "excused";
  if (v === "late") return "late";
  if (v === "absent") return "absent";
  return "unmarked";
}

function formatExcusalDetail(excusal: GuardianExcusalSummary): string {
  const sentAt = formatActivityWhen(excusal.created_at);
  const reason = excusal.reason?.trim() || "No reason provided";
  if (excusal.review_notes?.trim()) {
    return `Sent ${sentAt}. Reason: ${reason}. Staff note: ${excusal.review_notes.trim()}`;
  }
  return `Sent ${sentAt}. Reason: ${reason}`;
}

export function ParentDashboard() {
  const { user } = useAuth();
  const isHomeschool = user?.role === "homeschool_parent";
  const { tenant } = useTenant();
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [excusalOpen, setExcusalOpen] = useState(false);
  const [excusalRangeOnly, setExcusalRangeOnly] = useState(false);
  const [excusalPreset, setExcusalPreset] = useState<GuardianExcusalPreset | null>(
    null,
  );
  const [childActivity, setChildActivity] = useState<ParentChildActivity | null>(
    null,
  );
  const [activityLoading, setActivityLoading] = useState(false);
  const [assignmentGrades, setAssignmentGrades] =
    useState<ParentChildAssignmentGrades | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [attendanceOverview, setAttendanceOverview] =
    useState<GuardianAttendanceOverview | null>(null);
  const activeChildIdRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [gProfile, setGProfile] = useState<GamificationProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [insightsTab, setInsightsTab] = useState<"activity" | "badges">(
    "activity",
  );
  const [upcomingTab, setUpcomingTab] = useState<"classes" | "assignments">(
    "classes",
  );

  const firstName = user?.firstName ?? "Parent";
  const tenantName = tenant?.name ?? "";
  const tenantId = tenant?.id ?? user?.tenantId;
  const guardianBilling = useGuardianMemberBillingSummary();
  const showPayMembershipLink =
    !guardianBilling.loading &&
    Boolean(guardianBilling.status?.member_billing_enabled) &&
    !guardianBilling.allChildrenHaveActiveMembership;

  activeChildIdRef.current = activeChildId;

  useEffect(() => {
    setInsightsTab("activity");
    setUpcomingTab("classes");
  }, [activeChildId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChildrenLoading(true);
      setChildrenError(null);
      try {
        const rows = await getParentChildren();
        if (cancelled) return;
        setChildren(rows);
        setActiveChildId((prev) => {
          if (rows.length === 0) return null;
          if (prev && rows.some((r) => r.id === prev)) return prev;
          return rows[0].id;
        });
      } catch (e) {
        if (!cancelled) {
          setChildren([]);
          setActiveChildId(null);
          setChildrenError(
            e instanceof Error ? e.message : "Could not load children",
          );
        }
      } finally {
        if (!cancelled) setChildrenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const loadSessionsForChild = useCallback(async (childId: string) => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const ref = new Date();
      const weekEndMs =
        ref.getTime() + UPCOMING_CLASSES_WEEK_DAYS * 24 * 60 * 60 * 1000;
      const rows = await getParentChildrenSessions(24, childId, "upcoming", {
        sessionStartBefore: sessionStartBeforeExclusiveRollingDaysFromNow(
          UPCOMING_CLASSES_WEEK_DAYS,
        ),
      });
      const nowMs = ref.getTime();
      const nextThree = rows
        .filter((s) => {
          const t = new Date(s.session_start).getTime();
          return t > nowMs && t < weekEndMs;
        })
        .slice(0, UPCOMING_CLASSES_MAX);
      setSessions(nextThree);
    } catch (e) {
      setSessions([]);
      setSessionsError(
        e instanceof Error ? e.message : "Could not load upcoming sessions",
      );
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadAssignmentsForChild = useCallback(async (childId: string) => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const rows = await getParentChildAssignments(childId, 200);
      setAssignments(rows);
    } catch (e) {
      setAssignments([]);
      setAssignmentsError(
        e instanceof Error ? e.message : "Could not load assignments",
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const loadActivityForChild = useCallback(async (childId: string) => {
    setActivityLoading(true);
    try {
      const data = await getParentChildActivity(childId);
      setChildActivity(data);
    } catch {
      setChildActivity(null);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadGradesForChild = useCallback(async (childId: string) => {
    setGradesLoading(true);
    try {
      const ref = new Date();
      const from = new Date(ref);
      from.setDate(from.getDate() - 120);
      const data = await getParentChildAssignmentGrades(childId, {
        graded_after: from.toISOString(),
        graded_before: ref.toISOString(),
        limit: 8,
      });
      setAssignmentGrades(data);
    } catch {
      setAssignmentGrades(null);
    } finally {
      setGradesLoading(false);
    }
  }, []);

  const loadAttendanceOverviewForChild = useCallback(async (childId: string) => {
    try {
      const data = await getParentChildAttendanceOverview(childId);
      setAttendanceOverview(data);
    } catch {
      setAttendanceOverview(null);
    }
  }, []);

  useEffect(() => {
    if (!activeChildId) {
      setSessions([]);
      setSessionsLoading(false);
      setSessionsError(null);
      setAssignments([]);
      setAssignmentsLoading(false);
      setAssignmentsError(null);
      setChildActivity(null);
      setActivityLoading(false);
      setAssignmentGrades(null);
      setGradesLoading(false);
      setAttendanceOverview(null);
      return;
    }
    void loadSessionsForChild(activeChildId);
    void loadActivityForChild(activeChildId);
    void loadAssignmentsForChild(activeChildId);
    void loadGradesForChild(activeChildId);
    void loadAttendanceOverviewForChild(activeChildId);
  }, [
    activeChildId,
    loadSessionsForChild,
    loadActivityForChild,
    loadAssignmentsForChild,
    loadGradesForChild,
    loadAttendanceOverviewForChild,
  ]);

  useEffect(() => {
    if (!activeChildId) {
      setProgress(null);
      setGProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const [sum, gp] = await Promise.all([
          getStudentSummary(activeChildId),
          getStudentGamificationProfile(activeChildId).catch(() => null),
        ]);
        if (!cancelled) {
          setProgress(sum);
          setGProfile(gp);
        }
      } catch {
        if (!cancelled) {
          setProgress(null);
          setGProfile(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChildId]);

  useTenantRealtime({
    tenantId,
    enabled: Boolean(user && tenantId),
    onSessionsInvalidate: () => {
      const id = activeChildIdRef.current;
      if (id) {
        void loadSessionsForChild(id);
        void loadActivityForChild(id);
        void loadGradesForChild(id);
        void loadAssignmentsForChild(id);
        void loadAttendanceOverviewForChild(id);
      }
    },
  });

  const excusalBySessionId = useMemo(() => {
    const map: Record<string, GuardianExcusalSummary> = {};
    for (const row of attendanceOverview?.rows ?? []) {
      if (row.excusal?.status) {
        map[row.session_id] = row.excusal;
      }
    }
    return map;
  }, [attendanceOverview]);

  const recentAttendanceRows = useMemo(
    () => (attendanceOverview?.rows ?? []).slice(0, ATTENDANCE_SNAPSHOT_MAX),
    [attendanceOverview],
  );

  const progressPct = overallProgressPercent(progress);
  const streakDays = gProfile?.streak?.current_streak ?? 0;
  const levelLabel = gProfile ? `Level ${gProfile.level}` : "—";
  const achievementBadges = gProfile?.badges ?? [];

  const upcomingWeekAssignments = useMemo(() => {
    const ref = new Date();
    const weekEndMs =
      ref.getTime() + UPCOMING_CLASSES_WEEK_DAYS * 24 * 60 * 60 * 1000;
    const nowMs = ref.getTime();
    const openAssignments = assignments
      .filter((item) => item.submission_status !== "submitted")
      .sort((a, b) => assignmentDueTs(a) - assignmentDueTs(b));

    const dueThisWeek = openAssignments.filter((item) => {
      const due = assignmentDueTs(item);
      return due >= nowMs && due <= weekEndMs;
    });

    // Keep "This week" focused, but fall back to open items so parents still see assigned work.
    const source = dueThisWeek.length > 0 ? dueThisWeek : openAssignments;
    return source.slice(0, UPCOMING_ASSIGNMENTS_MAX);
  }, [assignments]);

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
            Track classes, assignments, and progress for each learner
          </p>
        </div>
        <ParentChildSwitcherDropdown
          childrenList={children}
          activeChildId={activeChildId}
          onSelectChild={setActiveChildId}
          loading={childrenLoading}
          errorText={childrenError}
        />
      </header>

      {!childrenLoading && !childrenError && children.length === 0 ? (
        <p className="parent-dashboard__message-text" style={{ padding: "1rem 0" }}>
          No students are linked to your account in this workspace yet. Ask your school to
          connect you as a guardian, or add learners from Students if you run a home
          workspace.
        </p>
      ) : null}

      {children.map((child) => (
        <div
          key={child.id}
          id={`child-panel-${child.id}`}
          role="region"
          aria-label={`${childLabel(child)} — overview`}
          hidden={activeChildId !== child.id}
          className="parent-dashboard__panel"
        >
          {activeChildId === child.id ? (
          <div className="dashboard-bento__grid parent-dashboard__main-grid">
            <div className="dashboard-bento__card dashboard-bento__card--orange parent-dashboard__peek-card parent-dashboard__cell-upcoming">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">This week</h2>
                <Link
                  to={
                    upcomingTab === "assignments" && activeChildId
                      ? `/app/assignments?studentId=${encodeURIComponent(activeChildId)}`
                      : activeChildId
                        ? `/app/messages?hub=events&studentId=${encodeURIComponent(activeChildId)}`
                        : "/app/messages?hub=events"
                  }
                  className="dashboard-bento__card-action parent-dashboard__card-action--header"
                  aria-label={
                    upcomingTab === "assignments"
                      ? "View all assignments for this learner"
                      : "View all class days"
                  }
                >
                  View all <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <div
                className="parent-dashboard__peek-tabs"
                role="tablist"
                aria-label="This week — classes and assignments"
              >
                <button
                  type="button"
                  role="tab"
                  id={`parent-upcoming-tab-classes-${child.id}`}
                  aria-selected={upcomingTab === "classes"}
                  aria-controls={`parent-upcoming-panel-classes-${child.id}`}
                  tabIndex={upcomingTab === "classes" ? 0 : -1}
                  className={`parent-dashboard__peek-tab parent-dashboard__peek-tab--classes${upcomingTab === "classes" ? " parent-dashboard__peek-tab--active" : ""}`}
                  onClick={() => setUpcomingTab("classes")}
                >
                  <CalendarDays
                    size={18}
                    strokeWidth={2.25}
                    className="parent-dashboard__peek-tab-icon"
                    aria-hidden
                  />
                  <span className="parent-dashboard__peek-tab-label">Classes</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`parent-upcoming-tab-assignments-${child.id}`}
                  aria-selected={upcomingTab === "assignments"}
                  aria-controls={`parent-upcoming-panel-assignments-${child.id}`}
                  tabIndex={upcomingTab === "assignments" ? 0 : -1}
                  className={`parent-dashboard__peek-tab parent-dashboard__peek-tab--assignments${upcomingTab === "assignments" ? " parent-dashboard__peek-tab--active" : ""}`}
                  onClick={() => setUpcomingTab("assignments")}
                >
                  <BookOpen
                    size={18}
                    strokeWidth={2.25}
                    className="parent-dashboard__peek-tab-icon"
                    aria-hidden
                  />
                  <span className="parent-dashboard__peek-tab-label">Assignments</span>
                </button>
              </div>

              <div
                className="parent-dashboard__peek-panel-wrap"
                hidden={upcomingTab !== "classes"}
              >
                <div
                  className="parent-dashboard__scroll-region"
                  role="tabpanel"
                  id={`parent-upcoming-panel-classes-${child.id}`}
                  aria-labelledby={`parent-upcoming-tab-classes-${child.id}`}
                  hidden={upcomingTab !== "classes"}
                  aria-label="Upcoming classes this week"
                  tabIndex={0}
                >
                  <ul className="dashboard-bento__activity-list parent-dashboard__scroll-list" role="list">
                    {sessionsLoading ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text">Loading sessions…</span>
                      </li>
                    ) : sessionsError ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text" role="alert">
                          {sessionsError}
                        </span>
                      </li>
                    ) : sessions.length === 0 ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text">
                          No upcoming classes this week.
                        </span>
                      </li>
                    ) : (
                      sessions.map((session) => {
                        const excusal = excusalBySessionId[session.id];
                        const showExcusalTooltip =
                          excusal?.status === "pending" || excusal?.status === "approved";
                        return (
                        <li key={session.id} className="parent-dashboard__session-row" role="listitem">
                          <img
                            src="/assets/cartoon-icons/Callendar.png"
                            alt=""
                            className="dashboard-bento__card-icon-img"
                            aria-hidden
                          />
                          <span className="parent-dashboard__session-text">
                            {formatSessionRow(session)}
                            {excusal ? (
                              showExcusalTooltip ? (
                                <AppTooltip
                                  title={excusalStatusLabel(excusal.status)}
                                  description={formatExcusalDetail(excusal)}
                                  placement="top"
                                  forceCustomInReact19
                                >
                                  <span
                                    className={`parent-dashboard__excusal-state parent-dashboard__excusal-state--${excusal.status} parent-dashboard__excusal-state--with-tooltip`}
                                  >
                                    {excusalStatusLabel(excusal.status)}
                                  </span>
                                </AppTooltip>
                              ) : (
                                <span
                                  className={`parent-dashboard__excusal-state parent-dashboard__excusal-state--${excusal.status}`}
                                >
                                  {excusalStatusLabel(excusal.status)}
                                </span>
                              )
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="parent-dashboard__session-excusal"
                            onClick={() => {
                              setExcusalRangeOnly(false);
                              setExcusalPreset({
                                sessionId: session.id,
                                classroomId: session.classroom_id,
                                sessionStart: session.session_start,
                                sessionEnd: session.session_end,
                                summaryLabel: formatSessionRow(session),
                              });
                              setExcusalOpen(true);
                            }}
                            aria-label="Request excusal for this session"
                          >
                            <ClipboardList size={12} aria-hidden />{" "}
                            {excusal ? "Excuse again" : "Excuse"}
                          </button>
                        </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>

              <div
                className="parent-dashboard__peek-panel-wrap"
                hidden={upcomingTab !== "assignments"}
              >
                <div
                  className="parent-dashboard__scroll-region"
                  role="tabpanel"
                  id={`parent-upcoming-panel-assignments-${child.id}`}
                  aria-labelledby={`parent-upcoming-tab-assignments-${child.id}`}
                  hidden={upcomingTab !== "assignments"}
                  aria-label="Assignments due this week"
                  tabIndex={0}
                >
                  <ul className="dashboard-bento__activity-list parent-dashboard__scroll-list" role="list">
                    {assignmentsLoading ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text">Loading assignments…</span>
                      </li>
                    ) : assignmentsError ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text" role="alert">
                          {assignmentsError}
                        </span>
                      </li>
                    ) : upcomingWeekAssignments.length === 0 ? (
                      <li className="parent-dashboard__session-row" role="listitem">
                        <span className="parent-dashboard__session-text">
                          No open assignments right now. Open Assignments for the full list and
                          past work.
                        </span>
                      </li>
                    ) : (
                      upcomingWeekAssignments.map((item) => (
                        <li
                          key={`${item.session_id}:${item.id}`}
                          className="parent-dashboard__session-row parent-dashboard__assignment-row"
                          role="listitem"
                        >
                          <BookOpen size={16} className="parent-dashboard__assignment-row-icon" aria-hidden />
                          <span className="parent-dashboard__session-text">
                            <strong className="parent-dashboard__assignment-title">{item.title}</strong>
                            <span className="parent-dashboard__assignment-meta">
                              {item.classroom_name} · Due {formatAssignmentDueLine(item)} ·{" "}
                              {assignmentStatusShort(item.submission_status)}
                            </span>
                          </span>
                          <span className="parent-dashboard__assignment-state">
                            {assignmentStatusShort(item.submission_status)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="dashboard-bento__card parent-dashboard__controls-card parent-dashboard__quick-links-card parent-dashboard__cell-quicklinks">
              <span className="parent-dashboard__controls-label">Quick links</span>
              <nav className="parent-dashboard__quick-links parent-dashboard__quick-links--compact" aria-label="Quick links">
                  <Link
                    to={
                      activeChildId
                        ? `/app/messages?hub=events&studentId=${encodeURIComponent(activeChildId)}`
                        : "/app/messages?hub=events"
                    }
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--events"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <CalendarDays size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">Events</span>
                      <span className="parent-dashboard__quick-link-hint">
                        Class days &amp; calendar
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--excusal-range"
                    disabled={!activeChildId}
                    onClick={() => {
                      setExcusalPreset(null);
                      setExcusalRangeOnly(true);
                      setExcusalOpen(true);
                    }}
                  >
                    <span
                      className="parent-dashboard__quick-link-icon parent-dashboard__quick-link-icon--img"
                      aria-hidden
                    >
                      <img
                        src="/assets/cartoon-icons/Callendar.png"
                        alt=""
                        width={28}
                        height={28}
                      />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">Excuse dates</span>
                      <span className="parent-dashboard__quick-link-hint">
                        Calendar range for absences
                      </span>
                    </span>
                  </button>
                  <Link
                    to={
                      activeChildId
                        ? `/app/messages?hub=attendance&studentId=${encodeURIComponent(activeChildId)}`
                        : "/app/messages?hub=attendance"
                    }
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--attendance"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <ClipboardList size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">Attendance</span>
                      <span className="parent-dashboard__quick-link-hint">
                        See recorded attendance
                      </span>
                    </span>
                  </Link>
                  <Link
                    to={
                      activeChildId
                        ? `/app/child-analytics?studentId=${encodeURIComponent(activeChildId)}`
                        : "/app/child-analytics"
                    }
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--analytics"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <Sparkles size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">Child analytics</span>
                      <span className="parent-dashboard__quick-link-hint">
                        Trends, activity, and progress
                      </span>
                    </span>
                  </Link>
                  <Link
                    to="/app/messages"
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--messages"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <MessageSquareText size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">
                        Updates &amp; messages
                      </span>
                      <span className="parent-dashboard__quick-link-hint">
                        School inbox &amp; threads
                      </span>
                    </span>
                  </Link>
                  {isHomeschool ? (
                    <>
                      <Link
                        to="/app/billing"
                        className="parent-dashboard__quick-link parent-dashboard__quick-link--billing"
                      >
                        <span className="parent-dashboard__quick-link-icon" aria-hidden>
                          <CreditCard size={22} strokeWidth={2} />
                        </span>
                        <span className="parent-dashboard__quick-link-text">
                          <span className="parent-dashboard__quick-link-label">Billing</span>
                          <span className="parent-dashboard__quick-link-hint">
                            Plans &amp; subscription
                          </span>
                        </span>
                      </Link>
                      <Link
                        to="/app/settings"
                        className="parent-dashboard__quick-link parent-dashboard__quick-link--settings"
                      >
                        <span className="parent-dashboard__quick-link-icon" aria-hidden>
                          <Settings size={22} strokeWidth={2} />
                        </span>
                        <span className="parent-dashboard__quick-link-text">
                          <span className="parent-dashboard__quick-link-label">Settings</span>
                          <span className="parent-dashboard__quick-link-hint">
                            Workspace preferences
                          </span>
                        </span>
                      </Link>
                    </>
                  ) : null}
                  {showPayMembershipLink ? (
                    <Link
                      to="/app/member-billing/pay"
                      className="parent-dashboard__quick-link parent-dashboard__quick-link--pay"
                    >
                      <span className="parent-dashboard__quick-link-icon" aria-hidden>
                        <WalletCards size={22} strokeWidth={2} />
                      </span>
                      <span className="parent-dashboard__quick-link-text">
                        <span className="parent-dashboard__quick-link-label">
                          Pay membership
                        </span>
                        <span className="parent-dashboard__quick-link-hint">
                          Learner fees &amp; checkout
                        </span>
                      </span>
                    </Link>
                  ) : null}
              </nav>
              <div className="parent-dashboard__attendance-preview">
                <div className="parent-dashboard__attendance-preview-head">
                  <span>Attendance snapshot</span>
                  <Link
                    to={
                      activeChildId
                        ? `/app/attendance?studentId=${encodeURIComponent(activeChildId)}`
                        : "/app/attendance"
                    }
                    className="dashboard-bento__card-action parent-dashboard__card-action--header"
                  >
                    View all <ChevronRight size={14} aria-hidden />
                  </Link>
                </div>
                {recentAttendanceRows.length === 0 ? (
                  <p className="parent-dashboard__message-text">
                    No recent attendance records yet.
                  </p>
                ) : (
                  <ul className="parent-dashboard__attendance-list" role="list">
                    {recentAttendanceRows.map((row) => (
                      <li key={row.session_id} className="parent-dashboard__attendance-row" role="listitem">
                        <span className="parent-dashboard__attendance-main">
                          <span className="parent-dashboard__attendance-class">
                            {row.classroom_name}
                          </span>
                          <span className="parent-dashboard__attendance-meta">
                            {formatAttendanceSessionMeta(row.session_start, row.session_end)}
                          </span>
                        </span>
                        <span
                          className={`parent-dashboard__attendance-status parent-dashboard__attendance-status--${attendanceStatusTone(row.attendance_status)}`}
                        >
                          {attendanceStatusLabel(row.attendance_status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="parent-dashboard__progress-activity-stack">
              <div className="dashboard-bento__card dashboard-bento__card--orange parent-dashboard__card--child-progress parent-dashboard__cell-progress">
                <div className="dashboard-bento__card-header">
                  <h2 className="dashboard-bento__card-title">Child Progress</h2>
                  <div className="dashboard-bento__card-icon">
                    <img src="/assets/cartoon-icons/strong.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
                  </div>
                </div>
                <div className="parent-dashboard__progress-main">
                  {detailLoading ? (
                    <p className="parent-dashboard__message-text">Loading progress…</p>
                  ) : (
                    <ProgressBar
                      value={progressPct}
                      label="Lessons & labs completed"
                      showPercent
                      variant="xp"
                    />
                  )}
                </div>
                <div className="parent-dashboard__progress-stats">
                  <div className="dashboard-bento__streak">
                    <img src="/assets/cartoon-icons/Thunder.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
                    {streakDays} day streak
                  </div>
                  <span className="parent-dashboard__stat">{levelLabel}</span>
                  <span className="parent-dashboard__stat">
                    <img src="/assets/cartoon-icons/Crown.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />{" "}
                    {gProfile?.total_xp != null ? `${gProfile.total_xp} XP` : "XP —"}
                  </span>
                </div>
              </div>

              <div className="dashboard-bento__card parent-dashboard__insights-card parent-dashboard__cell-insights">
                <div
                  className="parent-dashboard__insights-tabs"
                  role="tablist"
                  aria-label="Learner highlights"
                >
                  <button
                    type="button"
                    role="tab"
                    id={`parent-insights-tab-activity-${child.id}`}
                    aria-selected={insightsTab === "activity"}
                    aria-controls={`parent-insights-panel-activity-${child.id}`}
                    tabIndex={insightsTab === "activity" ? 0 : -1}
                    className={`parent-dashboard__insights-tab parent-dashboard__insights-tab--activity${insightsTab === "activity" ? " parent-dashboard__insights-tab--active" : ""}`}
                    onClick={() => setInsightsTab("activity")}
                  >
                    <Sparkles
                      size={20}
                      strokeWidth={2.25}
                      className="parent-dashboard__insights-tab-icon"
                      aria-hidden
                    />
                    <span className="parent-dashboard__insights-tab-label">
                      Recent activities
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id={`parent-insights-tab-badges-${child.id}`}
                    aria-selected={insightsTab === "badges"}
                    aria-controls={`parent-insights-panel-badges-${child.id}`}
                    tabIndex={insightsTab === "badges" ? 0 : -1}
                    className={`parent-dashboard__insights-tab parent-dashboard__insights-tab--badges${insightsTab === "badges" ? " parent-dashboard__insights-tab--active" : ""}`}
                    onClick={() => setInsightsTab("badges")}
                  >
                    <Award
                      size={20}
                      strokeWidth={2.25}
                      className="parent-dashboard__insights-tab-icon"
                      aria-hidden
                    />
                    <span className="parent-dashboard__insights-tab-label">
                      Recent badges
                    </span>
                  </button>
                </div>

                <div className="parent-dashboard__insights-panels">
                <div
                  className="parent-dashboard__insights-panel-wrap"
                  hidden={insightsTab !== "activity"}
                >
                  <div
                    className="parent-dashboard__insights-panel"
                    id={`parent-insights-panel-activity-${child.id}`}
                    role="tabpanel"
                    aria-labelledby={`parent-insights-tab-activity-${child.id}`}
                    hidden={insightsTab !== "activity"}
                  >
                    <div className="parent-dashboard__insights-panel-toolbar">
                      <span className="parent-dashboard__insights-panel-hint">
                        Last few things they did
                      </span>
                      <Link
                        to={
                          activeChildId
                            ? `/app/child-analytics?studentId=${encodeURIComponent(activeChildId)}`
                            : "/app/child-analytics"
                        }
                        className="dashboard-bento__card-action parent-dashboard__card-action--header parent-dashboard__insights-panel-link"
                        aria-label="View learner analytics"
                      >
                        View analytics <ChevronRight size={14} aria-hidden />
                      </Link>
                    </div>
                    {childActivity?.weekly_digest ? (
                      <div
                        className="parent-dashboard__digest"
                        aria-label="Last 7 days summary"
                      >
                        <span className="parent-dashboard__digest-pill">
                          {childActivity.weekly_digest.lessons_completed} lessons
                        </span>
                        <span className="parent-dashboard__digest-pill">
                          {childActivity.weekly_digest.labs_completed} labs
                        </span>
                        <span className="parent-dashboard__digest-pill">
                          {childActivity.weekly_digest.badges_earned} badges
                        </span>
                        <span className="parent-dashboard__digest-pill">
                          +{childActivity.weekly_digest.xp_earned} XP
                        </span>
                        <span className="parent-dashboard__digest-pill">
                          {childActivity.weekly_digest.sessions_attended} sessions
                        </span>
                        <span className="parent-dashboard__digest-pill">
                          {childActivity.weekly_digest.assignments_submitted ?? 0}{" "}
                          assignments
                        </span>
                      </div>
                    ) : null}
                    <div
                      className="parent-dashboard__grades-preview"
                      aria-label="Recent graded assignments"
                    >
                      <div className="parent-dashboard__insights-panel-toolbar parent-dashboard__insights-panel-toolbar--tight">
                        <span className="parent-dashboard__insights-panel-hint">
                          Graded work (last ~4 months)
                        </span>
                      </div>
                      <ul className="parent-dashboard__grades-preview-list" role="list">
                        {gradesLoading ? (
                          <li className="parent-dashboard__grades-preview-row">
                            <span>Loading grades…</span>
                          </li>
                        ) : !assignmentGrades?.grades?.length ? (
                          <li className="parent-dashboard__grades-preview-row parent-dashboard__grades-preview-row--muted">
                            <span>
                              No graded assignments in this window yet. When instructors
                              post scores, they will appear here.
                            </span>
                          </li>
                        ) : (
                          assignmentGrades.grades.map((g) => (
                            <li
                              key={`${g.session_id}-${g.graded_at}-${g.assignment_id ?? ""}`}
                              className="parent-dashboard__grades-preview-row"
                              role="listitem"
                            >
                              <span className="parent-dashboard__grades-preview-main">
                                <strong>{g.score}/100</strong>
                                <span className="parent-dashboard__grades-preview-class">
                                  {g.classroom_name}
                                </span>
                                {g.session_display_title ? (
                                  <span className="parent-dashboard__grades-preview-session">
                                    {g.session_display_title}
                                  </span>
                                ) : null}
                              </span>
                              <span className="parent-dashboard__grades-preview-when">
                                {formatActivityWhen(g.graded_at)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div
                      className="parent-dashboard__activity-scroll parent-dashboard__activity-scroll--in-insights"
                      role="region"
                      aria-label="Activity entries"
                      tabIndex={0}
                    >
                      <ul className="dashboard-bento__activity-list" role="list">
                        {activityLoading ? (
                          <li className="dashboard-bento__activity-item" role="listitem">
                            <span className="dashboard-bento__activity-text">
                              Loading activity…
                            </span>
                            <span className="dashboard-bento__activity-time">—</span>
                          </li>
                        ) : !childActivity?.items?.length ? (
                          <li className="dashboard-bento__activity-item" role="listitem">
                            <span className="dashboard-bento__activity-text">
                              No recent activity yet. Completed lessons, labs, badges, and
                              class attendance will show up here.
                            </span>
                            <span className="dashboard-bento__activity-time">—</span>
                          </li>
                        ) : (
                          childActivity.items.slice(0, ACTIVITY_PREVIEW).map((item) => (
                            <li
                              key={`${item.kind}-${item.ref_id ?? item.occurred_at}`}
                              className="dashboard-bento__activity-item"
                              role="listitem"
                            >
                              <span className="dashboard-bento__activity-text">
                                <strong>{item.title}</strong>
                                {item.detail ? (
                                  <>
                                    {" "}
                                    <span className="parent-dashboard__activity-detail">
                                      {item.detail}
                                    </span>
                                  </>
                                ) : null}
                              </span>
                              <span className="dashboard-bento__activity-time">
                                {formatActivityWhen(item.occurred_at)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                <div
                  className="parent-dashboard__insights-panel-wrap"
                  hidden={insightsTab !== "badges"}
                >
                  <div
                    className="parent-dashboard__insights-panel"
                    id={`parent-insights-panel-badges-${child.id}`}
                    role="tabpanel"
                    aria-labelledby={`parent-insights-tab-badges-${child.id}`}
                    hidden={insightsTab !== "badges"}
                  >
                    <div className="parent-dashboard__insights-panel-toolbar">
                      <span className="parent-dashboard__insights-panel-hint">
                        Stickers &amp; milestones
                      </span>
                      <Link
                        to={
                          activeChildId
                            ? `/app/achievements?studentId=${encodeURIComponent(activeChildId)}`
                            : "/app/achievements"
                        }
                        className="dashboard-bento__card-action parent-dashboard__card-action--header parent-dashboard__insights-panel-link"
                        aria-label="View all achievements"
                      >
                        View all <ChevronRight size={14} aria-hidden />
                      </Link>
                    </div>
                    <div
                      className="parent-dashboard__insights-scroll parent-dashboard__insights-scroll--badges"
                      role="region"
                      aria-label="Recent badges"
                      tabIndex={0}
                    >
                      {detailLoading ? (
                        <p className="parent-dashboard__message-text parent-dashboard__message-text--in-scroll">
                          Loading…
                        </p>
                      ) : achievementBadges.length === 0 ? (
                        <p className="parent-dashboard__message-text parent-dashboard__message-text--in-scroll">
                          No badges yet.
                        </p>
                      ) : (
                        <div className="dashboard-bento__badges parent-dashboard__badges-scroll">
                          {achievementBadges.map((b) => (
                            <div
                              key={b.id}
                              className="dashboard-bento__badge parent-dashboard__achievement-badge"
                              title={b.badge?.name ?? "Badge"}
                            >
                              {(b.badge?.name ?? "?").slice(0, 2)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      ))}
      {activeChildId ? (
        <GuardianExcusalRequestModal
          open={excusalOpen}
          onClose={() => {
            setExcusalOpen(false);
            setExcusalPreset(null);
            setExcusalRangeOnly(false);
          }}
          studentId={activeChildId}
          preset={excusalPreset}
          rangeOnly={excusalRangeOnly}
          onSuccess={() => {
            void loadSessionsForChild(activeChildId);
            void loadAttendanceOverviewForChild(activeChildId);
          }}
        />
      ) : null}
    </div>
  );
}
