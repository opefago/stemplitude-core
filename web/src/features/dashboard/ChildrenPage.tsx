import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CreditCard, LayoutDashboard, Settings } from "lucide-react";
import {
  getParentChildren,
  type StudentProfile,
} from "../../lib/api/students";
import { useTenant } from "../../providers/TenantProvider";
import { useGuardianMemberBillingSummary } from "../../hooks/useGuardianMemberBillingSummary";
import "./dashboard-bento.css";
import "./children-page.css";

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

function childInitials(s: StudentProfile): string {
  const f = (s.first_name ?? "").trim().charAt(0);
  const l = (s.last_name ?? "").trim().charAt(0);
  if (f || l) return (f + l).toUpperCase();
  const d = (s.display_name ?? "").trim();
  if (d.length >= 2) return d.slice(0, 2).toUpperCase();
  return "?";
}

export function ChildrenPage() {
  const { tenant } = useTenant();
  const guardianBilling = useGuardianMemberBillingSummary();
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const childMembershipMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of guardianBilling.status?.children ?? []) {
      m.set(row.student_id, row.has_active_membership);
    }
    return m;
  }, [guardianBilling.status?.children]);

  const showPayForChild = (studentId: string) =>
    !guardianBilling.loading &&
    Boolean(guardianBilling.status?.member_billing_enabled) &&
    !childMembershipMap.get(studentId);

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

  const tenantName = tenant?.name?.trim() || "this workspace";

  return (
    <div className="children-page" role="main" aria-label="My children">
      <header className="children-page__header">
        <div className="children-page__header-icon" aria-hidden>
          <img src="/assets/cartoon-icons/Players.png" alt="" />
        </div>
        <div className="children-page__header-text">
          <h1 className="children-page__title">My children</h1>
          <p className="children-page__subtitle">
            Learners linked to you in <strong>{tenantName}</strong>. Open{" "}
            <strong>Parent &amp; learner settings</strong> for messaging rules, grade level, and
            removing your guardian link.
          </p>
          <p className="children-page__hint">
            <span>Tip: use</span>
            <span className="children-page__hint-kbd">Children</span>
            <span>in the left sidebar anytime.</span>
          </p>
        </div>
      </header>

      {loading ? (
        <div className="children-page__grid" aria-busy="true" aria-label="Loading">
          <div className="children-page__skeleton" />
          <div className="children-page__skeleton" />
        </div>
      ) : error ? (
        <div className="children-page__error" role="alert">
          {error}
        </div>
      ) : children.length === 0 ? (
        <div className="children-page__empty">
          <div className="children-page__empty-icon" aria-hidden>
            <img src="/assets/cartoon-icons/Players.png" alt="" />
          </div>
          <h2 className="children-page__empty-title">No learners linked yet</h2>
          <p className="children-page__empty-copy">
            If you use a school account, ask your organization to connect you as a guardian. Home
            workspace operators can add students from the Students area.
          </p>
          <Link to="/app" className="children-page__empty-cta">
            Back to home
            <ChevronRight size={18} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="children-page__grid">
          {children.map((c) => (
            <article key={c.id} className="children-page__card">
              <div className="children-page__card-top">
                <div className="children-page__avatar" aria-hidden>
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" />
                  ) : (
                    childInitials(c)
                  )}
                </div>
                <div className="children-page__card-body">
                  <h2 className="children-page__name">{childLabel(c)}</h2>
                  {c.email ? (
                    <p className="children-page__meta">{c.email}</p>
                  ) : (
                    <p className="children-page__meta">No email on file</p>
                  )}
                  <div className="children-page__pills">
                    {c.grade_level ? (
                      <span className="children-page__pill">Grade {c.grade_level}</span>
                    ) : (
                      <span className="children-page__pill" style={{ opacity: 0.75 }}>
                        Grade not set
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="children-page__actions">
                <Link
                  to={`/app/children/settings?student=${encodeURIComponent(c.id)}`}
                  className="children-page__action children-page__action--primary"
                >
                  <Settings size={17} strokeWidth={2.25} aria-hidden />
                  Parent &amp; learner settings
                </Link>
                {showPayForChild(c.id) ? (
                  <Link
                    to={`/app/member-billing/pay?student=${encodeURIComponent(c.id)}`}
                    className="children-page__action"
                  >
                    <CreditCard size={17} strokeWidth={2.25} aria-hidden />
                    Pay membership
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                ) : null}
                <Link to="/app" className="children-page__action children-page__action--ghost">
                  <LayoutDashboard size={17} strokeWidth={2.25} aria-hidden />
                  View on home dashboard
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
