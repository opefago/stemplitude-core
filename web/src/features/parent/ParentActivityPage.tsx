import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  getParentChildActivity,
  getParentChildren,
  type ParentActivityItem,
  type ParentActivityKind,
  type ParentChildActivity,
  type StudentProfile,
} from "../../lib/api/students";
import "./parent-activity.css";

const PAGE_SIZE = 40;

const KIND_OPTIONS: { value: "all" | ParentActivityKind; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "lesson_completed", label: "Lessons" },
  { value: "lab_completed", label: "Labs" },
  { value: "assignment_submitted", label: "Assignments" },
  { value: "sticker_earned", label: "Badges" },
  { value: "xp_earned", label: "XP" },
  { value: "attendance", label: "Class sessions" },
];

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || "Student";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function utcDayStart(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`;
}

function utcDayEnd(isoDate: string): string {
  return `${isoDate}T23:59:59.999Z`;
}

function classFilterFromSearchParam(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (!v || v === "all") return "all";
  if (v === "general") return "__general";
  return v;
}

function classSearchParamFromFilter(classFilter: string): string | null {
  if (classFilter === "all") return null;
  if (classFilter === "__general") return "general";
  return classFilter;
}

export function ParentActivityPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdParam = searchParams.get("studentId")?.trim() || "";

  const allowed =
    user?.role === "parent" || user?.role === "homeschool_parent";

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [payload, setPayload] = useState<ParentChildActivity | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const page = useMemo(() => {
    const n = Number(searchParams.get("page") || "1");
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, [searchParams]);

  const dateFrom = (searchParams.get("from") ?? "").trim();
  const dateTo = (searchParams.get("to") ?? "").trim();
  const kindFilter = useMemo((): "all" | ParentActivityKind => {
    const k = (searchParams.get("kind") ?? "").trim();
    const allowedKinds = new Set(
      KIND_OPTIONS.filter((o) => o.value !== "all").map((o) => o.value),
    );
    if (k && allowedKinds.has(k as ParentActivityKind))
      return k as ParentActivityKind;
    return "all";
  }, [searchParams]);

  const classFilter = useMemo(
    () => classFilterFromSearchParam(searchParams.get("class")),
    [searchParams],
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoadingChildren(true);
      try {
        const rows = await getParentChildren();
        if (!cancelled) setChildren(rows);
      } catch {
        if (!cancelled) setChildren([]);
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const activeStudentId = useMemo(() => {
    if (studentIdParam && children.some((c) => c.id === studentIdParam))
      return studentIdParam;
    return children[0]?.id ?? "";
  }, [studentIdParam, children]);

  const patchParams = useCallback(
    (patch: Record<string, string | null | undefined>, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, val] of Object.entries(patch)) {
        if (val === null || val === undefined || val === "")
          next.delete(key);
        else next.set(key, val);
      }
      if (options?.resetPage) next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!allowed || !activeStudentId) {
      setPayload(null);
      setListError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const skip = (page - 1) * PAGE_SIZE;
        const req: Parameters<typeof getParentChildActivity>[1] = {
          skip,
          limit: PAGE_SIZE,
        };
        if (dateFrom) req.occurred_after = utcDayStart(dateFrom);
        if (dateTo) req.occurred_before = utcDayEnd(dateTo);
        if (kindFilter !== "all") req.activity_kind = kindFilter;
        if (classFilter === "__general") req.without_classroom = true;
        else if (classFilter !== "all") req.classroom_id = classFilter;

        const data = await getParentChildActivity(activeStudentId, req);
        if (!cancelled) setPayload(data);
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setListError(
            e instanceof Error ? e.message : "Could not load activity",
          );
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    allowed,
    activeStudentId,
    page,
    dateFrom,
    dateTo,
    kindFilter,
    classFilter,
  ]);

  useEffect(() => {
    if (!payload || listLoading) return;
    const lim = payload.limit || PAGE_SIZE;
    const tp = Math.max(1, Math.ceil(payload.total / lim));
    if (page > tp) {
      if (tp <= 1) patchParams({ page: null });
      else patchParams({ page: String(tp) });
    }
  }, [payload, listLoading, page, patchParams]);

  const items: ParentActivityItem[] = payload?.items ?? [];
  const total = payload?.total ?? 0;
  const limit = payload?.limit ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const classOptions = payload?.enrolled_classrooms ?? [];

  const setStudentInUrl = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("studentId", id);
      else next.delete("studentId");
      next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const goPage = useCallback(
    (nextPage: number) => {
      const p = Math.max(1, nextPage);
      if (p <= 1) patchParams({ page: null });
      else patchParams({ page: String(p) });
    },
    [patchParams],
  );

  if (!allowed) {
    return (
      <div className="parent-activity-page" role="main">
        <p className="parent-activity-page__denied">
          This activity view is for guardian accounts.
        </p>
        <Link to="/app" className="parent-activity-page__back-link">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="parent-activity-page" role="main" aria-label="Learner activity">
      <header className="parent-activity-page__header">
        <Link to="/app" className="parent-activity-page__crumb">
          <ChevronLeft size={18} aria-hidden /> Dashboard
        </Link>
        <h1 className="parent-activity-page__title">Activity</h1>
        <p className="parent-activity-page__subtitle">
          Timeline for the selected learner. Use dates to bound what loads; results are
          paged. Leaving dates empty uses the last 90 days through today (UTC).
        </p>
      </header>

      {loadingChildren ? (
        <p className="parent-activity-page__muted">Loading learners…</p>
      ) : children.length === 0 ? (
        <p className="parent-activity-page__muted">
          No learners linked to your account in this workspace.
        </p>
      ) : (
        <>
          <div className="parent-activity-page__learner-row" role="tablist" aria-label="Learner">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activeStudentId === c.id}
                className={`parent-activity-page__learner-tab ${
                  activeStudentId === c.id ? "parent-activity-page__learner-tab--active" : ""
                }`}
                onClick={() => setStudentInUrl(c.id)}
              >
                {childLabel(c)}
              </button>
            ))}
          </div>

          <div className="parent-activity-page__filters">
            <label className="parent-activity-page__filter">
              <span className="parent-activity-page__filter-label">From (UTC date)</span>
              <input
                type="date"
                className="parent-activity-page__date-input"
                value={dateFrom}
                onChange={(e) =>
                  patchParams({ from: e.target.value || null }, { resetPage: true })
                }
              />
            </label>
            <label className="parent-activity-page__filter">
              <span className="parent-activity-page__filter-label">Through (UTC date)</span>
              <input
                type="date"
                className="parent-activity-page__date-input"
                value={dateTo}
                onChange={(e) =>
                  patchParams({ to: e.target.value || null }, { resetPage: true })
                }
              />
            </label>
            <label className="parent-activity-page__filter">
              <span className="parent-activity-page__filter-label">Class</span>
              <select
                value={classFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  const param = classSearchParamFromFilter(v);
                  patchParams({ class: param }, { resetPage: true });
                }}
                className="parent-activity-page__select"
              >
                <option value="all">All classes</option>
                <option value="__general">Not tied to a class</option>
                {classOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="parent-activity-page__filter">
              <span className="parent-activity-page__filter-label">Type</span>
              <select
                value={kindFilter}
                onChange={(e) => {
                  const v = e.target.value as "all" | ParentActivityKind;
                  patchParams(
                    { kind: v === "all" ? null : v },
                    { resetPage: true },
                  );
                }}
                className="parent-activity-page__select"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listError ? (
            <p className="parent-activity-page__muted" role="alert">
              {listError}
            </p>
          ) : listLoading ? (
            <p className="parent-activity-page__muted">Loading activity…</p>
          ) : items.length === 0 ? (
            <p className="parent-activity-page__muted">
              No activity in this range and filters.
            </p>
          ) : (
            <>
              <ul className="parent-activity-page__list" role="list">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.ref_id ?? item.occurred_at}`} role="listitem">
                    <div className="parent-activity-page__row">
                      <div className="parent-activity-page__row-main">
                        <strong className="parent-activity-page__row-title">{item.title}</strong>
                        {item.detail ? (
                          <span className="parent-activity-page__row-detail">{item.detail}</span>
                        ) : null}
                        {item.class_name ? (
                          <span className="parent-activity-page__row-class">{item.class_name}</span>
                        ) : null}
                      </div>
                      <time
                        className="parent-activity-page__row-time"
                        dateTime={item.occurred_at}
                      >
                        {formatWhen(item.occurred_at)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
              <nav
                className="parent-activity-page__pager"
                aria-label="Activity pages"
              >
                <button
                  type="button"
                  className="parent-activity-page__pager-btn"
                  disabled={page <= 1 || listLoading}
                  onClick={() => goPage(page - 1)}
                >
                  Previous
                </button>
                <span className="parent-activity-page__pager-meta">
                  Page {page} of {totalPages}
                  {total > 0 ? ` · ${total} events` : null}
                </span>
                <button
                  type="button"
                  className="parent-activity-page__pager-btn"
                  disabled={page >= totalPages || listLoading}
                  onClick={() => goPage(page + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
