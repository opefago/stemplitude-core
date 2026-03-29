import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import {
  getParentChildActivity,
  getParentChildren,
  type ParentActivityItem,
  type ParentActivityKind,
  type StudentProfile,
} from "../../lib/api/students";
import "./parent-activity.css";

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

export function ParentActivityPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdParam = searchParams.get("studentId")?.trim() || "";

  const allowed =
    user?.role === "parent" || user?.role === "homeschool_parent";

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [items, setItems] = useState<ParentActivityItem[]>([]);
  const [digestLoading, setDigestLoading] = useState(false);

  const [classFilter, setClassFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | ParentActivityKind>("all");

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

  useEffect(() => {
    if (!allowed || !activeStudentId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDigestLoading(true);
      try {
        const limit = 40;
        let skip = 0;
        const merged: ParentActivityItem[] = [];
        let total = 0;
        for (;;) {
          const page = await getParentChildActivity(activeStudentId, {
            skip,
            limit,
          });
          merged.push(...(page.items ?? []));
          total = page.total;
          if (page.items.length < limit || merged.length >= total) break;
          skip += limit;
        }
        if (!cancelled) setItems(merged);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setDigestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, activeStudentId]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      const id = it.classroom_id?.trim();
      const name = (it.class_name ?? "").trim();
      if (id && name) map.set(id, name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      if (classFilter === "all") return true;
      if (!it.classroom_id) {
        return classFilter === "__general";
      }
      return it.classroom_id === classFilter;
    });
  }, [items, kindFilter, classFilter]);

  const setStudentInUrl = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("studentId", id);
      else next.delete("studentId");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
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
          Full timeline for the selected learner. Filter by class or activity type.
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
              <span className="parent-activity-page__filter-label">Class</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
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
                onChange={(e) =>
                  setKindFilter(e.target.value as "all" | ParentActivityKind)
                }
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

          {digestLoading ? (
            <p className="parent-activity-page__muted">Loading activity…</p>
          ) : filtered.length === 0 ? (
            <p className="parent-activity-page__muted">
              No activity matches these filters.
            </p>
          ) : (
            <ul className="parent-activity-page__list" role="list">
              {filtered.map((item) => (
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
          )}
        </>
      )}
    </div>
  );
}
