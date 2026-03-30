import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CreditCard,
  MessageSquareText,
  Receipt,
  Settings,
  WalletCards,
  X,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getParentChildActivity,
  getParentChildren,
  getParentChildrenSessions,
  sessionStartBeforeExclusiveRollingDaysFromNow,
  type ParentChildActivity,
  type SessionResponse,
  type StudentProfile,
} from "../../lib/api/students";
import { getStudentSummary, type ProgressSummary } from "../../lib/api/progress";
import {
  getStudentGamificationProfile,
  type GamificationProfile,
} from "../../lib/api/gamification";
import { ProgressBar } from "../../components/ui";
import { ParentChildSwitcherDropdown } from "../parent/ParentChildSwitcherDropdown";
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
  const [childActivity, setChildActivity] = useState<ParentChildActivity | null>(
    null
  );
  const [activityLoading, setActivityLoading] = useState(false);
  const activeChildIdRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [gProfile, setGProfile] = useState<GamificationProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  useEffect(() => {
    if (!activeChildId) {
      setSessions([]);
      setSessionsLoading(false);
      setSessionsError(null);
      setChildActivity(null);
      setActivityLoading(false);
      return;
    }
    void loadSessionsForChild(activeChildId);
    void loadActivityForChild(activeChildId);
  }, [activeChildId, loadSessionsForChild, loadActivityForChild]);

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
      }
    },
  });

  const handleCancelSession = (sessionLabel: string) => {
    alert(`Cancel session "${sessionLabel}"? (Placeholder — use Classes for full session tools.)`);
  };

  const progressPct = overallProgressPercent(progress);
  const streakDays = gProfile?.streak?.current_streak ?? 0;
  const levelLabel = gProfile ? `Level ${gProfile.level}` : "—";
  const achievementBadges = gProfile?.badges ?? [];

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
            View your children&apos;s progress and upcoming sessions
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
            <div className="dashboard-bento__card dashboard-bento__card--orange parent-dashboard__peek-card parent-dashboard__peek-card--upcoming-week parent-dashboard__cell-upcoming">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Upcoming this week</h2>
                <Link
                  to="/app/classrooms"
                  className="dashboard-bento__card-action parent-dashboard__card-action--header"
                  aria-label="View all classes"
                >
                  View all <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <div
                className="parent-dashboard__scroll-region"
                role="region"
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
                    sessions.map((session) => (
                      <li
                        key={session.id}
                        className="parent-dashboard__session-row"
                        role="listitem"
                      >
                        <img src="/assets/cartoon-icons/Callendar.png" alt="" className="dashboard-bento__card-icon-img" aria-hidden />
                        <span className="parent-dashboard__session-text">
                          {formatSessionRow(session)}
                        </span>
                        <button
                          type="button"
                          className="parent-dashboard__session-cancel"
                          onClick={() => handleCancelSession(formatSessionRow(session))}
                          aria-label="Cancel session"
                        >
                          <X size={12} aria-hidden /> Cancel
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="dashboard-bento__card dashboard-bento__card--purple parent-dashboard__peek-card parent-dashboard__cell-achievements">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">
                  Recent Achievements
                </h2>
                <Link
                  to={
                    activeChildId
                      ? `/app/achievements?studentId=${encodeURIComponent(activeChildId)}`
                      : "/app/achievements"
                  }
                  className="dashboard-bento__card-action parent-dashboard__card-action--header"
                  aria-label="View all achievements"
                >
                  View all <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <div
                className="parent-dashboard__scroll-region parent-dashboard__scroll-region--badges"
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

            <div className="dashboard-bento__card parent-dashboard__controls-card parent-dashboard__quick-links-card parent-dashboard__cell-quicklinks">
              <span className="parent-dashboard__controls-label">Quick links</span>
              <nav className="parent-dashboard__quick-links parent-dashboard__quick-links--compact" aria-label="Quick links">
                  <Link
                    to="/app/messages?hub=events"
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
                  <Link
                    to="/app/notifications"
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--notifications"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <Bell size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">
                        Notifications
                      </span>
                      <span className="parent-dashboard__quick-link-hint">
                        Alerts from your school
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
                  <Link
                    to="/app/member-billing/invoices"
                    className="parent-dashboard__quick-link parent-dashboard__quick-link--invoices"
                  >
                    <span className="parent-dashboard__quick-link-icon" aria-hidden>
                      <Receipt size={22} strokeWidth={2} />
                    </span>
                    <span className="parent-dashboard__quick-link-text">
                      <span className="parent-dashboard__quick-link-label">My invoices</span>
                      <span className="parent-dashboard__quick-link-hint">
                        Receipts &amp; history
                      </span>
                    </span>
                  </Link>
              </nav>
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

              <div className="dashboard-bento__card dashboard-bento__card--red parent-dashboard__cell-activity">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Activity Timeline</h2>
                <Link
                  to={
                    activeChildId
                      ? `/app/activity?studentId=${encodeURIComponent(activeChildId)}`
                      : "/app/activity"
                  }
                  className="dashboard-bento__card-action parent-dashboard__card-action--header"
                  aria-label="View full activity"
                >
                  View all <ChevronRight size={14} aria-hidden />
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
                className="parent-dashboard__activity-scroll"
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
                        No recent activity yet. Completed lessons, labs, badges, and class
                        attendance will show up here.
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
          </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
