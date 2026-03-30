import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KidDropdown } from "../../components/ui";
import { useAuth } from "../../providers/AuthProvider";
import { getParentChildren, type StudentProfile } from "../../lib/api/students";
import {
  createMemberCheckout,
  getGuardianMemberStatus,
  getMemberPayCatalog,
  type GuardianMemberStatus,
  type MemberProduct,
} from "../../lib/api/memberBilling";
import { ApiHttpError } from "../../lib/api/client";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";
import { formatStripeCurrency } from "./stripeCurrency";

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

export function MemberPayPage() {
  const { user, subType } = useAuth();
  const [searchParams] = useSearchParams();
  const paramStudent = searchParams.get("student");

  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [catalog, setCatalog] = useState<MemberProduct[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardianStatus, setGuardianStatus] = useState<GuardianMemberStatus | null>(
    null,
  );

  const isStudentSession = subType === "student";

  const resolvedStudentId = useMemo(() => {
    if (isStudentSession && user?.id) return user.id;
    return selectedStudent || paramStudent || "";
  }, [isStudentSession, user?.id, selectedStudent, paramStudent]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGuardianStatus(null);
    try {
      if (!isStudentSession) {
        let gs: GuardianMemberStatus | null = null;
        try {
          gs = await getGuardianMemberStatus();
        } catch {
          gs = null;
        }
        setGuardianStatus(gs);
        const rows = await getParentChildren();
        setChildren(rows);
        const initial =
          paramStudent && rows.some((r) => r.id === paramStudent)
            ? paramStudent
            : rows[0]?.id ?? "";
        setSelectedStudent(initial);
        if (gs && !gs.member_billing_enabled) {
          setCatalog([]);
          setSelectedProduct("");
          return;
        }
      } else {
        setGuardianStatus(null);
      }
      const products = await getMemberPayCatalog();
      setCatalog(products);
      if (products[0]) setSelectedProduct(products[0].id);
    } catch (e) {
      const msg =
        e instanceof ApiHttpError
          ? String(e.message)
          : e instanceof Error
            ? e.message
            : "Could not load payment options";
      setError(msg);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [isStudentSession, paramStudent]);

  useEffect(() => {
    void load();
  }, [load]);

  const studentPayOptions = useMemo(() => {
    if (children.length === 0) {
      return [{ value: "", label: "No linked learners", disabled: true }];
    }
    return children.map((c) => ({ value: c.id, label: childLabel(c) }));
  }, [children]);

  const productPayOptions = useMemo(() => {
    if (catalog.length === 0) {
      return [{ value: "", label: "No products available", disabled: true }];
    }
    return catalog.map((p) => ({
      value: p.id,
      label: `${p.name} — ${formatStripeCurrency(p.amount_cents, p.currency)}${
        p.billing_type === "recurring" && p.interval ? ` / ${p.interval}` : ""
      }`,
    }));
  }, [catalog]);

  const onPay = async () => {
    if (!resolvedStudentId || !selectedProduct) {
      setError("Choose a learner and a product.");
      return;
    }
    setCheckoutBusy(true);
    setError(null);
    try {
      const { url } = await createMemberCheckout({
        product_id: selectedProduct,
        student_id: resolvedStudentId,
      });
      window.location.href = url;
    } catch (e) {
      setCheckoutBusy(false);
      setError(e instanceof Error ? e.message : "Checkout could not start");
    }
  };

  const billingOffForGuardian =
    !isStudentSession && guardianStatus && !guardianStatus.member_billing_enabled;

  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">
          {billingOffForGuardian ? "Membership" : "Pay membership"}
        </h1>
        <p className="mb-page__subtitle">
          {billingOffForGuardian ? (
            <>
              This organization is not collecting paid memberships through STEMplitude. Your
              learners&apos; access is included with the program—there is nothing to pay here.
            </>
          ) : (
            <>
              Complete checkout on Stripe. You will receive receipts and invoices from your
              organization&apos;s connected account.
            </>
          )}
        </p>
      </header>
      <p className="mb-muted">
        <Link className="mb-link" to="/app/member-billing/invoices">
          View my invoices
        </Link>
      </p>

      {error ? (
        <div className="mb-section mb-alert" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mb-muted">Loading…</p>
      ) : billingOffForGuardian ? (
        <section className="mb-section mb-included-card" aria-label="Membership status">
          <p className="mb-included-card__title">Paid membership not required</p>
          <p className="mb-muted">
            If your school adds optional paid plans later, checkout will appear here. You can still
            open invoices from past purchases below.
          </p>
        </section>
      ) : (
        <section className="mb-section">
          {!isStudentSession ? (
            <div className="mb-form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label>
                Learner
                <KidDropdown
                  value={selectedStudent}
                  onChange={setSelectedStudent}
                  ariaLabel="Select learner"
                  placeholder="Select learner"
                  fullWidth
                  disabled={checkoutBusy}
                  options={studentPayOptions}
                />
              </label>
            </div>
          ) : null}

          <div className="mb-form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>
              Product
              <KidDropdown
                value={selectedProduct}
                onChange={setSelectedProduct}
                ariaLabel="Select product"
                placeholder="Select product"
                fullWidth
                disabled={checkoutBusy || catalog.length === 0}
                options={productPayOptions}
              />
            </label>
          </div>

          <div className="mb-actions">
            <button
              type="button"
              className="mb-btn mb-btn--primary"
              onClick={() => void onPay()}
              disabled={checkoutBusy || !resolvedStudentId || !selectedProduct || catalog.length === 0}
            >
              {checkoutBusy ? "Redirecting…" : "Continue to secure checkout"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
