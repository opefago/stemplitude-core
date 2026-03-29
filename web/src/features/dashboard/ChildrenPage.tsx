import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  getParentChildren,
  type StudentProfile,
} from "../../lib/api/students";
import "./dashboard-bento.css";
import "./parent-dashboard.css";

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

export function ChildrenPage() {
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await getParentChildren();
        if (!cancelled) setChildren(rows);
      } catch (e) {
        if (!cancelled) {
          setChildren([]);
          setError(e instanceof Error ? e.message : "Could not load children");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="dashboard-bento parent-dashboard"
      style={{ maxWidth: 720, margin: "0 auto", padding: "var(--spacing-lg)" }}
      role="main"
      aria-label="My children"
    >
      <header className="dashboard-bento__header">
        <h1 className="dashboard-bento__greeting" style={{ fontSize: "1.5rem" }}>
          My children
        </h1>
        <p className="dashboard-bento__subtitle">
          Learners linked to you in this workspace. Use Home to see progress and upcoming
          classes.
        </p>
      </header>

      {loading ? (
        <p className="parent-dashboard__message-text">Loading…</p>
      ) : error ? (
        <p className="parent-dashboard__message-text" role="alert">
          {error}
        </p>
      ) : children.length === 0 ? (
        <p className="parent-dashboard__message-text">
          No students are linked yet. If you use a school account, ask your organization to
          connect you as a guardian.
        </p>
      ) : (
        <ul className="dashboard-bento__activity-list" role="list">
          {children.map((c) => (
            <li
              key={c.id}
              className="dashboard-bento__activity-item"
              role="listitem"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
            >
              <div>
                <span className="dashboard-bento__activity-text">{childLabel(c)}</span>
                {c.email ? (
                  <span
                    className="dashboard-bento__activity-time"
                    style={{ display: "block", marginTop: "0.25rem" }}
                  >
                    {c.email}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                <Link
                  to={`/app/member-billing/pay?student=${encodeURIComponent(c.id)}`}
                  className="dashboard-bento__card-action"
                  style={{ flexShrink: 0 }}
                >
                  Pay membership <ChevronRight size={14} aria-hidden />
                </Link>
                <Link
                  to="/app"
                  className="dashboard-bento__card-action"
                  style={{ flexShrink: 0 }}
                >
                  Dashboard <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
