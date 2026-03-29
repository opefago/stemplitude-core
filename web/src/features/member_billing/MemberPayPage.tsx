import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { getParentChildren, type StudentProfile } from "../../lib/api/students";
import {
  createMemberCheckout,
  getMemberPayCatalog,
  type MemberProduct,
} from "../../lib/api/memberBilling";
import { ApiHttpError } from "../../lib/api/client";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";

function childLabel(s: StudentProfile): string {
  const dn = (s.display_name ?? "").trim();
  if (dn) return dn;
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Student";
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amountCents / 100);
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

  const isStudentSession = subType === "student";

  const resolvedStudentId = useMemo(() => {
    if (isStudentSession && user?.id) return user.id;
    return selectedStudent || paramStudent || "";
  }, [isStudentSession, user?.id, selectedStudent, paramStudent]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const products = await getMemberPayCatalog();
      setCatalog(products);
      if (!isStudentSession) {
        const rows = await getParentChildren();
        setChildren(rows);
        const initial =
          paramStudent && rows.some((r) => r.id === paramStudent)
            ? paramStudent
            : rows[0]?.id ?? "";
        setSelectedStudent(initial);
      }
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

  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">Pay membership</h1>
        <p className="mb-page__subtitle">
          Complete checkout on Stripe. You will receive receipts and invoices from your organization&apos;s
          connected account.
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
      ) : (
        <section className="mb-section">
          {!isStudentSession ? (
            <div className="mb-form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label htmlFor="mb-pay-student">
                Learner
                <select
                  id="mb-pay-student"
                  value={selectedStudent}
                  onChange={(ev) => setSelectedStudent(ev.target.value)}
                  disabled={checkoutBusy}
                >
                  {children.length === 0 ? (
                    <option value="">No linked learners</option>
                  ) : (
                    children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {childLabel(c)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          ) : null}

          <div className="mb-form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label htmlFor="mb-pay-product">
              Product
              <select
                id="mb-pay-product"
                value={selectedProduct}
                onChange={(ev) => setSelectedProduct(ev.target.value)}
                disabled={checkoutBusy || catalog.length === 0}
              >
                {catalog.length === 0 ? (
                  <option value="">No products available</option>
                ) : (
                  catalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.amount_cents, p.currency)}
                      {p.billing_type === "recurring" && p.interval ? ` / ${p.interval}` : ""}
                    </option>
                  ))
                )}
              </select>
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
