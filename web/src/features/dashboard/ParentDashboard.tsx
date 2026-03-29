import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { useTenantRealtime } from "../../hooks/useTenantRealtime";
import {
  getParentChildActivity,
  getParentChildren,
  getParentChildrenSessions,
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
const BADGES_PREVIEW = 3;

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
    return `Session · ${when}`;
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
    try {
      const rows = await getParentChildrenSessions(24, childId);
      setSessions(rows);
    } catch {
      setSessions([]);
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
  const badgePreview = (gProfile?.badges ?? []).slice(0, BADGES_PREVIEW);

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
        <div
          className="parent-dashboard__child-switcher"
          role="tablist"
          aria-label="Select child"
        >
          {childrenLoading ? (
            <span className="parent-dashboard__message-text">Loading children…</span>
          ) : childrenError ? (
            <span className="parent-dashboard__message-text" role="alert">
              {childrenError}
            </span>
          ) : (
            children.map((child) => (
              <button
                key={child.id}
                type="button"
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
                {childLabel(child)}
              </button>
            ))
          )}
        </div>
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
          role="tabpanel"
          aria-labelledby={`child-tab-${child.id}`}
          hidden={activeChildId !== child.id}
          className="parent-dashboard__panel"
        >
          {activeChildId === child.id ? (
          <div className="dashboard-bento__grid">
            <div className="dashboard-bento__card dashboard-bento__card--span-2 parent-dashboard__cta-strip">
              <div className="parent-dashboard__cta-row">
                <Link
                  to={
                    activeChildId
                      ? `/app/child?studentId=${encodeURIComponent(activeChildId)}&next=${encodeURIComponent("/app/assignments")}`
                      : "/app/child"
                  }
                  className="parent-dashboard__cta"
                >
                  Continue learning
                </Link>
                <Link
                  to={
                    activeChildId
                      ? `/app/child?studentId=${encodeURIComponent(activeChildId)}`
                      : "/app/child"
                  }
                  className="parent-dashboard__cta parent-dashboard__cta--primary"
                >
                  Enter learner view
                </Link>
                {activeChildId ? (
                  <Link
                    to={`/app/achievements?studentId=${encodeURIComponent(activeChildId)}`}
                    className="parent-dashboard__cta"
                  >
                    Achievements
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--row-2 dashboard-bento__card--green">
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
                {sessionsLoading ? (
                  <li className="parent-dashboard__session-row" role="listitem">
                    <span className="parent-dashboard__session-text">Loading sessions…</span>
                  </li>
                ) : sessions.length === 0 ? (
                  <li className="parent-dashboard__session-row" role="listitem">
                    <span className="parent-dashboard__session-text">
                      No upcoming sessions scheduled.
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

            <div className="dashboard-bento__card">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Next steps</h2>
              </div>
              <ul className="dashboard-bento__activity-list" role="list">
                {sessionsLoading ? (
                  <li className="parent-dashboard__session-row" role="listitem">
                    <span className="parent-dashboard__session-text">Loading…</span>
                  </li>
                ) : sessions.length === 0 ? (
                  <li className="parent-dashboard__session-row" role="listitem">
                    <span className="parent-dashboard__session-text">
                      No upcoming sessions — check back after the next class is scheduled.
                    </span>
                  </li>
                ) : (
                  sessions.slice(0, 3).map((s) => (
                    <li
                      key={`next-${s.id}`}
                      className="parent-dashboard__session-row"
                      role="listitem"
                    >
                      <span className="parent-dashboard__session-text">
                        {formatSessionRow(s)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="dashboard-bento__card dashboard-bento__card--purple">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">
                  Recent Achievements
                </h2>
              </div>
              <div className="dashboard-bento__badges">
                {detailLoading ? (
                  <p className="parent-dashboard__message-text">Loading…</p>
                ) : badgePreview.length === 0 ? (
                  <p className="parent-dashboard__message-text">No badges yet.</p>
                ) : (
                  badgePreview.map((b) => (
                    <div
                      key={b.id}
                      className="dashboard-bento__badge parent-dashboard__achievement-badge"
                      title={b.badge?.name ?? "Badge"}
                    >
                      {(b.badge?.name ?? "?").slice(0, 2)}
                    </div>
                  ))
                )}
              </div>
              <Link
                to={
                  activeChildId
                    ? `/app/achievements?studentId=${encodeURIComponent(activeChildId)}`
                    : "/app/achievements"
                }
                className="dashboard-bento__card-action"
                aria-label="View all achievements"
              >
                View all <ChevronRight size={14} aria-hidden />
              </Link>
            </div>

            <div className="dashboard-bento__card dashboard-bento__card--span-2 dashboard-bento__card--red">
              <div className="dashboard-bento__card-header">
                <h2 className="dashboard-bento__card-title">Activity Timeline</h2>
                <Link
                  to={
                    activeChildId
                      ? `/app/activity?studentId=${encodeURIComponent(activeChildId)}`
                      : "/app/activity"
                  }
                  className="dashboard-bento__card-action"
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

            <div className="dashboard-bento__card dashboard-bento__card--span-2 parent-dashboard__controls-card">
              <span className="parent-dashboard__controls-label">Quick links</span>
              <div className="parent-dashboard__controls-row">
                {isHomeschool ? (
                  <>
                    <Link to="/app/billing" className="parent-dashboard__control-link">
                      Billing
                    </Link>
                    <Link to="/app/settings" className="parent-dashboard__control-link">
                      Settings
                    </Link>
                  </>
                ) : null}
                <Link
                  to="/app/notifications"
                  className="parent-dashboard__control-link"
                >
                  Notifications
                </Link>
                <Link to="/app/messages" className="parent-dashboard__control-link">
                  Updates &amp; Messages
                </Link>
                <Link to="/app/member-billing/pay" className="parent-dashboard__control-link">
                  Pay membership
                </Link>
                <Link to="/app/member-billing/invoices" className="parent-dashboard__control-link">
                  My invoices
                </Link>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
