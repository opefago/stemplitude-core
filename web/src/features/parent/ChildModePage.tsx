import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { getParentChildren, type StudentProfile } from "../../lib/api/students";
import { setChildContextStudentId } from "../../lib/childContext";
import "./child-mode.css";

/** Safe in-app path after entering learner context (guards open redirects). */
function childModeDestination(nextParam: string | null): string {
  const raw = (nextParam ?? "").trim();
  if (
    raw.startsWith("/app/") &&
    !raw.startsWith("//") &&
    !raw.includes(":") &&
    !raw.includes("\\")
  ) {
    return raw;
  }
  return "/app";
}

function learnerLabel(s: StudentProfile): string {
  const d = s.display_name?.trim();
  if (d) return d;
  const parts = [s.first_name, s.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "Learner";
}

export function ChildModePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const studentId = searchParams.get("studentId")?.trim() || "";
  const nextParam = searchParams.get("next");
  const afterEnterPath = useMemo(
    () => childModeDestination(nextParam),
    [nextParam],
  );
  const nextQuery = useMemo(
    () =>
      afterEnterPath !== "/app"
        ? `&next=${encodeURIComponent(afterEnterPath)}`
        : "",
    [afterEnterPath],
  );
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (studentId) return;
    setChildContextStudentId(null);
  }, [tenant?.id, studentId]);

  useEffect(() => {
    let cancelled = false;
    setChildrenLoading(true);
    setLoadError(false);
    getParentChildren()
      .then((rows) => {
        if (!cancelled) setChildren(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setChildren([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setChildrenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const allowed =
    Boolean(studentId) && children.some((c) => c.id === studentId);

  useEffect(() => {
    if (!studentId || childrenLoading) return;
    if (!children.some((c) => c.id === studentId)) {
      setChildContextStudentId(null);
    }
  }, [studentId, childrenLoading, children]);

  useEffect(() => {
    if (!studentId || childrenLoading || !allowed) return;
    setChildContextStudentId(studentId);
    navigate(afterEnterPath, { replace: true });
  }, [studentId, childrenLoading, allowed, navigate, afterEnterPath]);

  useEffect(() => {
    if (studentId) return;
    if (childrenLoading) return;
    if (children.length !== 1) return;
    setChildContextStudentId(children[0].id);
    navigate(afterEnterPath, { replace: true });
  }, [studentId, childrenLoading, children, navigate, afterEnterPath]);

  if (!user || (user.role !== "parent" && user.role !== "homeschool_parent")) {
    return (
      <div className="child-mode">
        <p>Child Mode is only available for guardian accounts.</p>
        <Link to="/app">Back</Link>
      </div>
    );
  }

  if (childrenLoading) {
    return (
      <div className="child-mode" role="status" aria-live="polite">
        <h1 className="child-mode__title">Learner view</h1>
        <p className="child-mode__hint">Loading learners in this organization…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="child-mode">
        <h1 className="child-mode__title">Learner view</h1>
        <p className="child-mode__hint">
          We couldn&apos;t load learners for this organization. Check your connection and try again.
        </p>
        <Link to="/app" className="child-mode__primary">
          Back to Home
        </Link>
      </div>
    );
  }

  if (studentId) {
    if (!allowed) {
      return (
        <div className="child-mode">
          <h1 className="child-mode__title">Learner view</h1>
          <p className="child-mode__hint">
            That learner isn&apos;t linked to your account in this organization.
          </p>
          <Link to="/app/child" className="child-mode__primary">
            Choose another learner
          </Link>
        </div>
      );
    }
    return (
      <div className="child-mode" role="status" aria-live="polite">
        <p className="child-mode__hint">Opening learner home…</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="child-mode">
        <h1 className="child-mode__title">Learner view</h1>
        <p className="child-mode__hint">
          There are no learners linked to your account in{" "}
          <strong>{tenant?.name ?? "this organization"}</strong>. Add or link a learner first, then
          return here.
        </p>
        <div className="child-mode__tiles" style={{ marginTop: "1rem" }}>
          <Link to="/app/children" className="child-mode__tile">
            Manage children
          </Link>
          <Link to="/app" className="child-mode__tile">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (children.length === 1) {
    return (
      <div className="child-mode" role="status" aria-live="polite">
        <p className="child-mode__hint">Opening learner home…</p>
      </div>
    );
  }

  return (
    <div className="child-mode">
      <div className="child-mode__header">
        <h1 className="child-mode__title" style={{ margin: 0 }}>
          Who are you viewing as?
        </h1>
        <Link to="/app" className="child-mode__exit">
          Cancel
        </Link>
      </div>
      <p className="child-mode__hint">
        Pick a learner for <strong>{tenant?.name ?? "this organization"}</strong>. You can switch
        anytime from the bar at the top.
      </p>
      <ul className="child-mode__tiles child-mode__tiles--list">
        {children.map((c) => (
          <li key={c.id} className="child-mode__tile-wrap">
            <button
              type="button"
              className="child-mode__tile child-mode__tile--action"
              onClick={() =>
                navigate(
                  `/app/child?studentId=${encodeURIComponent(c.id)}${nextQuery}`,
                  { replace: true },
                )
              }
            >
              {learnerLabel(c)}
            </button>
          </li>
        ))}
      </ul>
      <p className="child-mode__footer-note">
        <Link to="/app/children">Manage children</Link>
        {" · "}
        <Link to="/app">Parent home</Link>
      </p>
    </div>
  );
}
