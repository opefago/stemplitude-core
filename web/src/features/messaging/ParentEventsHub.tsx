import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import {
  getParentChildAttendanceOverview,
  getParentChildren,
  getParentChildrenSessions,
  localMonthStartFromDateMonthsOffset,
  PARENT_EVENTS_UPCOMING_EXCLUSIVE_MONTH_OFFSET,
  sessionStartBeforeForParentEventsHub,
  type GuardianExcusalSummary,
  type SessionResponse,
  type StudentProfile,
} from "../../lib/api/students";
import { studentProfileDisplayName } from "../../lib/studentDisplayName";
import { KidSwitch } from "../../components/ui";
import {
  GuardianExcusalRequestModal,
  type GuardianExcusalPreset,
} from "../parent/GuardianExcusalRequestModal";
import "../../components/ui/ui.css";

const CALENDAR_PREF_KEY = "parent-events-calendar-sync-pref";

const SESSIONS_PER_PAGE = 10;

/**
 * Rolling next 7×24h from ``ref`` vs sessions on/after that window but before ``rangeEndExclusive``
 * (must match the API ``session_start_before`` bound).
 */
function partitionUpcomingByWeekAndRest(
  sessions: SessionResponse[],
  ref: Date,
  rangeEndExclusive: Date,
) {
  const rangeEndMs = rangeEndExclusive.getTime();
  const nowMs = ref.getTime();
  const weekEndExclusiveMs = nowMs + 7 * 24 * 60 * 60 * 1000;
  const soon: SessionResponse[] = [];
  const rest: SessionResponse[] = [];
  for (const s of sessions) {
    const startMs = new Date(s.session_start).getTime();
    if (startMs <= nowMs) continue;
    if (startMs >= rangeEndMs) continue;
    if (startMs < weekEndExclusiveMs) {
      soon.push(s);
    } else {
      rest.push(s);
    }
  }
  const byStart = (a: SessionResponse, b: SessionResponse) =>
    new Date(a.session_start).getTime() - new Date(b.session_start).getTime();
  soon.sort(byStart);
  rest.sort(byStart);
  return { thisWeek: soon, restOfMonth: rest };
}

function formatSessionTimeRange(isoStart: string, isoEnd: string): string {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    const dayPart = a.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const t1 = a.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
    const t2 = b.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dayPart} · ${t1} – ${t2}`;
  } catch {
    return "Session";
  }
}

function sessionDateParts(iso: string): { day: string; month: string; weekday: string } {
  try {
    const d = new Date(iso);
    return {
      day: String(d.getDate()),
      month: d
        .toLocaleString(undefined, { month: "short" })
        .replace(".", "")
        .toUpperCase(),
      weekday: d.toLocaleString(undefined, { weekday: "short" }),
    };
  } catch {
    return { day: "—", month: "", weekday: "" };
  }
}

type MainTab = "week" | "month" | "past";

function excusalStatusLabel(status: string): string {
  if (status === "pending") return "Excuse sent";
  if (status === "approved") return "Excusal approved";
  if (status === "denied") return "Excusal denied";
  return "Excusal sent";
}

export function useParentEventsWeekIndicator(enabled: boolean): boolean {
  const [hasThisWeek, setHasThisWeek] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHasThisWeek(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const ref = new Date();
        const rows = await getParentChildrenSessions(100, null, "upcoming", {
          sessionStartBefore: sessionStartBeforeForParentEventsHub(),
        });
        if (cancelled) return;
        const rangeEnd = localMonthStartFromDateMonthsOffset(
          ref,
          PARENT_EVENTS_UPCOMING_EXCLUSIVE_MONTH_OFFSET,
        );
        const { thisWeek } = partitionUpcomingByWeekAndRest(rows, ref, rangeEnd);
        setHasThisWeek(thisWeek.length > 0);
      } catch {
        if (!cancelled) setHasThisWeek(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return hasThisWeek;
}

export function ParentEventsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentParam = searchParams.get("studentId");

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(studentParam);

  const [mainTab, setMainTab] = useState<MainTab>("week");
  const [listPage, setListPage] = useState(1);
  const [upcoming, setUpcoming] = useState<SessionResponse[]>([]);
  const [past, setPast] = useState<SessionResponse[]>([]);
  const [excusalBySessionId, setExcusalBySessionId] = useState<Record<string, GuardianExcusalSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excusalOpen, setExcusalOpen] = useState(false);
  const [excusalRangeOnly, setExcusalRangeOnly] = useState(false);
  const [excusalPreset, setExcusalPreset] = useState<GuardianExcusalPreset | null>(null);
  const [calendarSync, setCalendarSync] = useState(() => {
    try {
      return localStorage.getItem(CALENDAR_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChildrenLoading(true);
      try {
        const list = await getParentChildren();
        if (cancelled) return;
        setChildren(list);
        setActiveStudentId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setChildren([]);
          setActiveStudentId(null);
        }
      } finally {
        if (!cancelled) setChildrenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (studentParam && children.some((c) => c.id === studentParam)) {
      setActiveStudentId(studentParam);
    }
  }, [studentParam, children]);

  const onPickChild = (id: string) => {
    setActiveStudentId(id);
    const next = new URLSearchParams(searchParams);
    next.set("studentId", id);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!activeStudentId) {
      setUpcoming([]);
      setPast([]);
      setExcusalBySessionId({});
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const monthBound = sessionStartBeforeForParentEventsHub();
      const [up, pa, attendance] = await Promise.all([
        getParentChildrenSessions(800, activeStudentId, "upcoming", {
          sessionStartBefore: monthBound,
          expandMonthSessions: true,
        }),
        getParentChildrenSessions(80, activeStudentId, "past"),
        getParentChildAttendanceOverview(activeStudentId),
      ]);
      setUpcoming(up);
      setPast(pa);
      const nextExcusalMap: Record<string, GuardianExcusalSummary> = {};
      for (const row of attendance.rows ?? []) {
        if (row.excusal?.status) {
          nextExcusalMap[row.session_id] = row.excusal;
        }
      }
      setExcusalBySessionId(nextExcusalMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load events");
      setUpcoming([]);
      setPast([]);
      setExcusalBySessionId({});
    } finally {
      setLoading(false);
    }
  }, [activeStudentId]);

  useEffect(() => {
    if (childrenLoading) return;
    void load();
  }, [childrenLoading, load]);

  const { thisWeek, restOfMonth } = useMemo(() => {
    const ref = new Date();
    const rangeEnd = localMonthStartFromDateMonthsOffset(
      ref,
      PARENT_EVENTS_UPCOMING_EXCLUSIVE_MONTH_OFFSET,
    );
    return partitionUpcomingByWeekAndRest(upcoming, ref, rangeEnd);
  }, [upcoming]);

  const hasThisWeek = thisWeek.length > 0;

  const onCalendarToggle = (next: boolean) => {
    setCalendarSync(next);
    try {
      if (next) localStorage.setItem(CALENDAR_PREF_KEY, "1");
      else localStorage.removeItem(CALENDAR_PREF_KEY);
    } catch {
      /* ignore */
    }
  };

  const activeFullList =
    mainTab === "past" ? past : mainTab === "week" ? thisWeek : restOfMonth;

  const totalPages = Math.max(
    1,
    Math.ceil(activeFullList.length / SESSIONS_PER_PAGE),
  );

  useEffect(() => {
    setListPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const selectTab = (tab: MainTab) => {
    setMainTab(tab);
    setListPage(1);
  };

  const page = Math.min(Math.max(1, listPage), totalPages);
  const pagedList = useMemo(() => {
    const start = (page - 1) * SESSIONS_PER_PAGE;
    return activeFullList.slice(start, start + SESSIONS_PER_PAGE);
  }, [activeFullList, page]);

  const showPagination = activeFullList.length > SESSIONS_PER_PAGE;

  const emptyPast = mainTab === "past" && past.length === 0 && !loading;
  const emptyWeek = mainTab === "week" && thisWeek.length === 0 && !loading;
  const emptyMonth = mainTab === "month" && restOfMonth.length === 0 && !loading;

  const classTitle = (s: SessionResponse) => {
    const n = (s.classroom_name ?? "").trim();
    return n || "Class time";
  };

  const openExcusalForSession = (s: SessionResponse) => {
    setExcusalRangeOnly(false);
    setExcusalPreset({
      sessionId: s.id,
      classroomId: s.classroom_id,
      summaryLabel: `${classTitle(s)} · ${formatSessionTimeRange(s.session_start, s.session_end)}`,
    });
    setExcusalOpen(true);
  };

  const listLoading = childrenLoading || loading;

  return (
    <main className="msg-hub-panel msg-hub-panel--events" aria-label="Class days and events">
      <div className="msg-hub-events__head">
        <div className="msg-hub-events__title-block">
          <img
            src="/assets/cartoon-icons/Callendar.png"
            alt=""
            className="msg-hub-events__title-mascot"
            width={44}
            height={44}
            aria-hidden
          />
          <div>
            <h2 className="msg-hub-panel__title">Class days</h2>
            <p className="msg-hub-events__tagline">When your learners have class</p>
          </div>
        </div>
        <div className="msg-hub-events__sync">
          <span className="msg-hub-events__sync-label">Save for calendar later</span>
          <KidSwitch
            checked={calendarSync}
            onChange={onCalendarToggle}
            ariaLabel="Remember calendar sync preference for later"
            size="sm"
          />
          <Sparkles size={16} className="msg-hub-events__sync-sparkle" aria-hidden />
        </div>
      </div>
      <p className="msg-hub-panel__desc">
        Next 7 days and sessions after that through the end of next calendar month. Full export is
        coming soon—your switch here just saves what you like. Request an excusal from a scheduled
        session below when your learner can&apos;t attend.
      </p>

      {childrenLoading ? (
        <p className="msg-hub-panel__muted">Loading learners…</p>
      ) : children.length === 0 ? (
        <p className="msg-hub-panel__muted">No linked learners in this workspace.</p>
      ) : children.length > 1 ? (
        <div className="msg-hub-events__learner-row">
          <label className="msg-hub-events__learner-label" htmlFor="msg-hub-events-learner">
            Learner
          </label>
          <select
            id="msg-hub-events-learner"
            className="msg-hub-events__learner-select"
            value={activeStudentId ?? ""}
            onChange={(e) => onPickChild(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {studentProfileDisplayName(c)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!childrenLoading && children.length > 0 && activeStudentId ? (
        <button
          type="button"
          className="msg-hub-events__excusal-calendar-quick"
          onClick={() => {
            setExcusalPreset(null);
            setExcusalRangeOnly(true);
            setExcusalOpen(true);
          }}
        >
          <img
            src="/assets/cartoon-icons/Callendar.png"
            alt=""
            className="msg-hub-events__excusal-calendar-quick__mascot"
            width={36}
            height={36}
          />
          <span className="msg-hub-events__excusal-calendar-quick__copy">
            <span className="msg-hub-events__excusal-calendar-quick__title">Excuse by dates</span>
            <span className="msg-hub-events__excusal-calendar-quick__hint">
              Opens the fun calendar to pick a range
            </span>
          </span>
        </button>
      ) : null}

      {!childrenLoading && children.length > 0 ? (
        <>
          <div className="msg-hub-events__main-tabs" role="tablist" aria-label="Event timeframe">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "week"}
              className={`msg-hub-events__main-tab${mainTab === "week" ? " msg-hub-events__main-tab--active" : ""}`}
              onClick={() => selectTab("week")}
            >
              <span className="msg-hub-events__main-tab-label">
                Next 7 days
                {hasThisWeek ? (
                  <span
                    className="msg-hub-events__tab-dot"
                    aria-label="Has a class in the next 7 days"
                  />
                ) : null}
              </span>
              {thisWeek.length > 0 ? (
                <span className="msg-hub-events__main-count">{thisWeek.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "month"}
              className={`msg-hub-events__main-tab${mainTab === "month" ? " msg-hub-events__main-tab--active" : ""}`}
              onClick={() => selectTab("month")}
            >
              <span className="msg-hub-events__main-tab-label">After next 7 days</span>
              {restOfMonth.length > 0 ? (
                <span className="msg-hub-events__main-count">{restOfMonth.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "past"}
              className={`msg-hub-events__main-tab${mainTab === "past" ? " msg-hub-events__main-tab--active" : ""}`}
              onClick={() => selectTab("past")}
            >
              <span className="msg-hub-events__main-tab-label">Past</span>
            </button>
          </div>

          {listLoading ? (
            <p className="msg-hub-panel__muted">Loading events…</p>
          ) : error ? (
            <p className="msg-hub-panel__muted" role="alert">
              {error}
            </p>
          ) : emptyPast ? (
            <p className="msg-hub-events__empty">No past class days yet.</p>
          ) : emptyWeek ? (
            <p className="msg-hub-events__empty">
              No class days in the next week—check &quot;After next 7 days&quot;!
            </p>
          ) : emptyMonth ? (
            <p className="msg-hub-events__empty">
              Nothing scheduled after the next 7 days in this range. Nice and easy.
            </p>
          ) : (
            <>
              <ul className="msg-hub-events__list" role="list">
                {pagedList.map((s) => {
                  const parts = sessionDateParts(s.session_start);
                  const isPast = mainTab === "past";
                  const excusal = excusalBySessionId[s.id];
                  return (
                    <li
                      key={s.id}
                      className={`msg-hub-events__card${isPast ? " msg-hub-events__card--past" : ""}`}
                      role="listitem"
                    >
                      <div className="msg-hub-events__card-datebox" aria-hidden>
                        <span className="msg-hub-events__card-day">{parts.day}</span>
                        <span className="msg-hub-events__card-month">{parts.month}</span>
                        <span className="msg-hub-events__card-weekday">{parts.weekday}</span>
                      </div>
                      <div className="msg-hub-events__card-body">
                        <div className="msg-hub-events__card-time-row">
                          <img
                            src="/assets/cartoon-icons/Callendar.png"
                            alt=""
                            className="msg-hub-events__card-cal-img"
                            width={26}
                            height={26}
                            aria-hidden
                          />
                          <span className="msg-hub-events__card-time">
                            {formatSessionTimeRange(s.session_start, s.session_end)}
                          </span>
                        </div>
                        <h3 className="msg-hub-events__card-title">{classTitle(s)}</h3>
                        {excusal ? (
                          <span
                            className={`msg-hub-events__excusal-state msg-hub-events__excusal-state--${excusal.status}`}
                          >
                            {excusalStatusLabel(excusal.status)}
                          </span>
                        ) : null}
                        {s.notes ? (
                          <p className="msg-hub-events__card-notes">{s.notes}</p>
                        ) : null}
                        {!isPast ? (
                          <div className="msg-hub-events__card-actions">
                            {s.meeting_link ? (
                              <a
                                href={s.meeting_link}
                                className="msg-hub-events__card-cta"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Join class
                              </a>
                            ) : null}
                            <button
                              type="button"
                              className="msg-hub-events__card-excusal"
                              onClick={() => openExcusalForSession(s)}
                            >
                              <ClipboardList size={14} aria-hidden />
                              {excusal ? "Excuse again" : "Request excusal"}
                            </button>
                          </div>
                        ) : s.meeting_link ? (
                          <a
                            href={s.meeting_link}
                            className="msg-hub-events__card-cta"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Join class
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {showPagination ? (
                <div
                  className="msg-hub-events__pagination"
                  role="navigation"
                  aria-label="Session list pages"
                >
                  <span className="msg-hub-events__pagination-meta">
                    Showing {(page - 1) * SESSIONS_PER_PAGE + 1}–
                    {Math.min(page * SESSIONS_PER_PAGE, activeFullList.length)} of{" "}
                    {activeFullList.length}
                  </span>
                  <div className="msg-hub-events__pagination-actions">
                    <button
                      type="button"
                      className="ui-btn ui-btn--secondary msg-hub-events__pagination-btn"
                      onClick={() => setListPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft size={16} aria-hidden /> Previous
                    </button>
                    <span className="msg-hub-events__pagination-page">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="ui-btn ui-btn--secondary msg-hub-events__pagination-btn"
                      onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Next <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <Link to="/app/classrooms" className="msg-hub-panel__link msg-hub-events__footer-link">
        See all classes
      </Link>

      {activeStudentId ? (
        <GuardianExcusalRequestModal
          open={excusalOpen}
          onClose={() => {
            setExcusalOpen(false);
            setExcusalPreset(null);
            setExcusalRangeOnly(false);
          }}
          studentId={activeStudentId}
          preset={excusalPreset}
          rangeOnly={excusalRangeOnly}
          onSuccess={() => load()}
        />
      ) : null}
    </main>
  );
}
