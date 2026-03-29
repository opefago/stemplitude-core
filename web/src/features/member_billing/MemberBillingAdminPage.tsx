import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { KidSwitch } from "../../components/ui";
import {
  createAdminMemberPaymentLink,
  createMemberProduct,
  getMemberBillingAnalytics,
  getMemberBillingConnectStatus,
  listMemberInvoicesAdmin,
  listMemberProductsAdmin,
  listMemberSubscriptionsAdmin,
  patchMemberBillingSettings,
  startMemberBillingOnboarding,
  syncMemberBillingConnect,
  type MemberBillingAnalytics,
  type MemberBillingConnectStatus,
  type MemberInvoice,
  type MemberProduct,
  type MemberProductCreatePayload,
  type MemberSubscription,
} from "../../lib/api/memberBilling";
import {
  listStudentParents,
  listStudents,
  type StudentParentLink,
  type StudentProfile,
} from "../../lib/api/students";
import { ApiHttpError } from "../../lib/api/client";
import "../../components/ui/ui.css";
import "../settings/settings.css";
import "./member-billing.css";

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function roleCanManageMemberBilling(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "owner" || r === "homeschool_parent";
}

function roleCanViewMemberBilling(role: string | null): boolean {
  return (
    roleCanManageMemberBilling(role) || (role ?? "").toLowerCase() === "instructor"
  );
}

export function MemberBillingAdminPage() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = roleCanManageMemberBilling(role);
  const canView = roleCanViewMemberBilling(role);

  const [status, setStatus] = useState<MemberBillingConnectStatus | null>(null);
  const [products, setProducts] = useState<MemberProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<MemberSubscription[]>([]);
  const [invoices, setInvoices] = useState<MemberInvoice[]>([]);
  const [analytics, setAnalytics] = useState<MemberBillingAnalytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [amountDollars, setAmountDollars] = useState("25");
  const [billingType, setBillingType] = useState<"one_time" | "recurring">("recurring");
  const [interval, setInterval] = useState<"month" | "quarter" | "year">("month");
  const [productError, setProductError] = useState<string | null>(null);

  const [payStudents, setPayStudents] = useState<StudentProfile[]>([]);
  const [payStudentId, setPayStudentId] = useState("");
  const [payParents, setPayParents] = useState<StudentParentLink[]>([]);
  const [payPayerUserId, setPayPayerUserId] = useState("");
  const [payProductId, setPayProductId] = useState("");
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  const [payLinkError, setPayLinkError] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!canView) return;
    setLoadError(null);
    try {
      const promises: Promise<unknown>[] = [
        listMemberSubscriptionsAdmin(),
        listMemberInvoicesAdmin(),
        getMemberBillingAnalytics(30),
      ];
      if (canManage) {
        promises.unshift(
          getMemberBillingConnectStatus(),
          listMemberProductsAdmin(),
        );
      }
      const results = await Promise.all(promises);
      let i = 0;
      if (canManage) {
        setStatus(results[i] as MemberBillingConnectStatus);
        setProducts(results[i + 1] as MemberProduct[]);
        i += 2;
      }
      setSubscriptions(results[i] as MemberSubscription[]);
      setInvoices(results[i + 1] as MemberInvoice[]);
      setAnalytics(results[i + 2] as MemberBillingAnalytics);
    } catch (e) {
      const msg =
        e instanceof ApiHttpError
          ? String(e.message)
          : e instanceof Error
            ? e.message
            : "Could not load member billing";
      setLoadError(msg);
    }
  }, [canManage, canView]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStudents({ limit: 500, is_active: true });
        if (!cancelled) setPayStudents(rows);
      } catch {
        if (!cancelled) setPayStudents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  useEffect(() => {
    if (!payStudentId) {
      setPayParents([]);
      setPayPayerUserId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStudentParents(payStudentId);
        if (!cancelled) {
          setPayParents(rows);
          setPayPayerUserId("");
        }
      } catch {
        if (!cancelled) {
          setPayParents([]);
          setPayPayerUserId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payStudentId]);

  useEffect(() => {
    const connect = searchParams.get("connect");
    if (connect === "return" || connect === "refresh") {
      void (async () => {
        if (canManage) {
          try {
            await syncMemberBillingConnect();
          } catch {
            /* ignore */
          }
          await refresh();
        }
        const next = new URLSearchParams(searchParams);
        next.delete("connect");
        setSearchParams(next, { replace: true });
      })();
    }
  }, [canManage, refresh, searchParams, setSearchParams]);

  const patchSetting = async (patch: {
    member_billing_enabled?: boolean;
    require_member_billing_for_access?: boolean;
  }) => {
    if (!canManage) return;
    setBusy(true);
    try {
      const next = await patchMemberBillingSettings(patch);
      setStatus(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onStartOnboarding = async () => {
    setOnboardingBusy(true);
    try {
      const { url } = await startMemberBillingOnboarding();
      window.location.href = url;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not start onboarding");
      setOnboardingBusy(false);
    }
  };

  const onSync = async () => {
    setBusy(true);
    try {
      const next = await syncMemberBillingConnect();
      setStatus(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const onCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductError(null);
    const dollars = Number.parseFloat(amountDollars);
    if (Number.isNaN(dollars) || dollars < 0.5) {
      setProductError("Enter a valid amount (minimum $0.50).");
      return;
    }
    const amount_cents = Math.round(dollars * 100);
    const payload: MemberProductCreatePayload = {
      name: productName.trim(),
      description: productDesc.trim() || null,
      amount_cents,
      currency: "usd",
      billing_type: billingType,
      interval: billingType === "recurring" ? interval : null,
    };
    if (!payload.name) {
      setProductError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      await createMemberProduct(payload);
      setProductName("");
      setProductDesc("");
      await refresh();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Could not create product");
    } finally {
      setBusy(false);
    }
  };

  const onGeneratePaymentLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLinkError(null);
    setPayLinkCopied(false);
    if (!payStudentId || !payProductId) {
      setPayLinkError("Choose a learner and a product.");
      return;
    }
    setPayLinkBusy(true);
    setPayLinkUrl(null);
    try {
      const { url } = await createAdminMemberPaymentLink({
        student_id: payStudentId,
        product_id: payProductId,
        payer_user_id: payPayerUserId || null,
      });
      setPayLinkUrl(url);
    } catch (err) {
      setPayLinkError(
        err instanceof ApiHttpError
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : "Could not create payment link",
      );
    } finally {
      setPayLinkBusy(false);
    }
  };

  const onCopyPayLink = async () => {
    if (!payLinkUrl) return;
    try {
      await navigator.clipboard.writeText(payLinkUrl);
      setPayLinkCopied(true);
      window.setTimeout(() => setPayLinkCopied(false), 2000);
    } catch {
      setPayLinkError("Could not copy to clipboard.");
    }
  };

  if (!canView) {
    return (
      <div className="mb-page" role="main">
        <header className="mb-page__header">
          <h1 className="mb-page__title">Membership billing</h1>
        </header>
        <p className="mb-muted">
          Your role does not include access to organization membership billing. Ask an admin if you need
          visibility here.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-page" role="main">
      <header className="mb-page__header">
        <h1 className="mb-page__title">Student &amp; family payments</h1>
        <p className="mb-page__subtitle">
          Collect tuition or membership fees via Stripe Connect (funds go to your connected Stripe account).
          This is separate from your STEMplitude subscription under Billing.
        </p>
      </header>

      {loadError ? (
        <div className="mb-section mb-alert" role="alert">
          {loadError}
        </div>
      ) : null}

      {!canManage ? (
        <div className="mb-section">
          <p className="mb-muted" style={{ margin: 0 }}>
            You can view subscriptions and invoices. Stripe Connect onboarding and products are managed by
            organization admins.
          </p>
        </div>
      ) : null}

      {canManage && status ? (
        <section className="mb-section" aria-labelledby="mb-connect-heading">
          <h2 id="mb-connect-heading" className="mb-section__title">
            Stripe Connect
          </h2>
          <div className="mb-grid">
            <div className="mb-stat">
              <span className="mb-stat__label">Charges</span>
              <span className="mb-stat__value">
                <span className={`mb-badge ${status.charges_enabled ? "mb-badge--ok" : "mb-badge--warn"}`}>
                  {status.charges_enabled ? "Enabled" : "Not ready"}
                </span>
              </span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Payouts</span>
              <span className="mb-stat__value">
                <span className={`mb-badge ${status.payouts_enabled ? "mb-badge--ok" : "mb-badge--muted"}`}>
                  {status.payouts_enabled ? "Enabled" : "Pending"}
                </span>
              </span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Platform Stripe</span>
              <span className="mb-stat__value">
                <span className={`mb-badge ${status.connect_configured ? "mb-badge--ok" : "mb-badge--warn"}`}>
                  {status.connect_configured ? "API key set" : "Missing secret key"}
                </span>
              </span>
            </div>
          </div>
          {!status.connect_configured ? (
            <div className="mb-section mb-alert" role="status" style={{ marginBottom: "1rem" }}>
              <strong>Enable onboarding:</strong> set <code className="billing-page__code">STRIPE_SECRET_KEY</code>{" "}
              in the API environment (your platform Stripe secret key from Dashboard → Developers → API keys), restart
              the server, and ensure Connect is turned on for that account (Dashboard → Connect → Get started). You do
              not need <code className="billing-page__code">STRIPE_CONNECT_CLIENT_ID</code> for Express onboarding here.
            </div>
          ) : null}
          {status.stripe_connect_account_id ? (
            <p className="mb-muted">
              Connected account{" "}
              <code style={{ fontSize: "0.85em" }}>{status.stripe_connect_account_id}</code>
            </p>
          ) : (
            <p className="mb-muted">No connected account yet. Start onboarding to create one.</p>
          )}
          <div className="mb-actions">
            <button
              type="button"
              className="mb-btn mb-btn--primary"
              onClick={() => void onStartOnboarding()}
              disabled={onboardingBusy || !status.connect_configured}
            >
              {onboardingBusy ? "Opening Stripe…" : "Open Stripe onboarding"}
            </button>
            <button type="button" className="mb-btn" onClick={() => void onSync()} disabled={busy}>
              Refresh status from Stripe
            </button>
          </div>
        </section>
      ) : null}

      {canManage && status ? (
        <section className="mb-section" aria-labelledby="mb-settings-heading">
          <h2 id="mb-settings-heading" className="mb-section__title">
            Organization settings
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <KidSwitch
                checked={status.member_billing_enabled}
                onChange={(v) => void patchSetting({ member_billing_enabled: v })}
                disabled={busy}
                ariaLabel="Enable member billing"
              />
              <span style={{ fontWeight: 700 }}>Enable family payments for this organization</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <KidSwitch
                checked={status.require_member_billing_for_access}
                onChange={(v) => void patchSetting({ require_member_billing_for_access: v })}
                disabled={busy}
                ariaLabel="Require active membership for some actions"
              />
              <span style={{ fontWeight: 700 }}>
                Require active membership for certain learner actions (e.g. lab project submit)
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="mb-section" aria-labelledby="mb-products-heading">
          <h2 id="mb-products-heading" className="mb-section__title">
            Products &amp; prices
          </h2>
          <form onSubmit={onCreateProduct} className="mb-form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="mb-form-row">
              <label htmlFor="mb-p-name">
                Name
                <input
                  id="mb-p-name"
                  value={productName}
                  onChange={(ev) => setProductName(ev.target.value)}
                  placeholder="Monthly membership"
                  disabled={busy}
                />
              </label>
              <label htmlFor="mb-p-amt">
                Amount (USD)
                <input
                  id="mb-p-amt"
                  value={amountDollars}
                  onChange={(ev) => setAmountDollars(ev.target.value)}
                  inputMode="decimal"
                  disabled={busy}
                />
              </label>
              <label htmlFor="mb-p-type">
                Billing
                <select
                  id="mb-p-type"
                  value={billingType}
                  onChange={(ev) =>
                    setBillingType(ev.target.value === "one_time" ? "one_time" : "recurring")
                  }
                  disabled={busy}
                >
                  <option value="recurring">Recurring</option>
                  <option value="one_time">One-time</option>
                </select>
              </label>
              {billingType === "recurring" ? (
                <label htmlFor="mb-p-interval">
                  Interval
                  <select
                    id="mb-p-interval"
                    value={interval}
                    onChange={(ev) => setInterval(ev.target.value as typeof interval)}
                    disabled={busy}
                  >
                    <option value="month">Monthly</option>
                    <option value="quarter">Quarterly</option>
                    <option value="year">Yearly</option>
                  </select>
                </label>
              ) : null}
            </div>
            <label htmlFor="mb-p-desc" style={{ width: "100%" }}>
              Description (optional)
              <input
                id="mb-p-desc"
                value={productDesc}
                onChange={(ev) => setProductDesc(ev.target.value)}
                disabled={busy}
              />
            </label>
            {productError ? <p className="mb-alert" style={{ margin: 0 }}>{productError}</p> : null}
            <button type="submit" className="mb-btn mb-btn--primary" disabled={busy} style={{ alignSelf: "flex-start" }}>
              Create on Stripe
            </button>
          </form>
          <div className="mb-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="mb-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="mb-muted">
                      No products yet.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{formatMoney(p.amount_cents, p.currency)}</td>
                      <td>
                        {p.billing_type}
                        {p.interval ? ` · ${p.interval}` : ""}
                      </td>
                      <td>{p.active ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="mb-section" aria-labelledby="mb-paylink-heading">
          <h2 id="mb-paylink-heading" className="mb-section__title">
            Payment link for a family
          </h2>
          <p className="mb-muted" style={{ marginTop: 0 }}>
            Generates a Stripe Checkout URL for a specific learner and product. The guardian pays on Stripe—no card
            numbers are collected in this app. If you do not pick a payer, we use the first linked guardian with an
            email, otherwise the learner email.
          </p>
          {status && (!status.member_billing_enabled || !status.charges_enabled) ? (
            <p className="mb-alert" role="status">
              Turn on member billing and finish Stripe Connect (charges enabled) before generating links.
            </p>
          ) : null}
          <form
            onSubmit={onGeneratePaymentLink}
            className="mb-form-row"
            style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}
          >
            <div className="mb-form-row" style={{ flexWrap: "wrap" }}>
              <label htmlFor="mb-pay-student" style={{ minWidth: "12rem", flex: "1" }}>
                Learner
                <select
                  id="mb-pay-student"
                  value={payStudentId}
                  onChange={(ev) => {
                    setPayStudentId(ev.target.value);
                    setPayLinkUrl(null);
                  }}
                  disabled={payLinkBusy}
                >
                  <option value="">Select…</option>
                  {payStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {[s.first_name, s.last_name].filter(Boolean).join(" ") || s.id}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="mb-pay-payer" style={{ minWidth: "12rem", flex: "1" }}>
                Bill to (optional)
                <select
                  id="mb-pay-payer"
                  value={payPayerUserId}
                  onChange={(ev) => setPayPayerUserId(ev.target.value)}
                  disabled={payLinkBusy || !payStudentId}
                >
                  <option value="">Default (guardian email, else learner)</option>
                  {payParents
                    .filter((p) => (p.user_email ?? "").trim())
                    .map((p) => (
                      <option key={p.id} value={p.user_id}>
                        {(p.user_email ?? "").trim()} ({p.relationship})
                      </option>
                    ))}
                </select>
              </label>
              <label htmlFor="mb-pay-product" style={{ minWidth: "12rem", flex: "1" }}>
                Product
                <select
                  id="mb-pay-product"
                  value={payProductId}
                  onChange={(ev) => {
                    setPayProductId(ev.target.value);
                    setPayLinkUrl(null);
                  }}
                  disabled={payLinkBusy}
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.active}>
                      {p.name}
                      {!p.active ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {payLinkError ? (
              <p className="mb-alert" style={{ margin: 0 }} role="alert">
                {payLinkError}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="submit"
                className="mb-btn mb-btn--primary"
                disabled={
                  payLinkBusy ||
                  !status?.member_billing_enabled ||
                  !status?.charges_enabled
                }
              >
                {payLinkBusy ? "Creating…" : "Generate Checkout link"}
              </button>
              {payLinkUrl ? (
                <>
                  <button type="button" className="mb-btn" onClick={() => void onCopyPayLink()} disabled={payLinkBusy}>
                    {payLinkCopied ? "Copied" : "Copy link"}
                  </button>
                  <a className="mb-link" href={payLinkUrl} target="_blank" rel="noreferrer">
                    Open Checkout
                  </a>
                </>
              ) : null}
            </div>
            {payLinkUrl ? (
              <p className="mb-muted" style={{ margin: 0, wordBreak: "break-all", fontSize: "0.85rem" }}>
                {payLinkUrl}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      {analytics ? (
        <section className="mb-section" aria-labelledby="mb-analytics-heading">
          <h2 id="mb-analytics-heading" className="mb-section__title">
            Last 30 days
          </h2>
          <div className="mb-grid">
            <div className="mb-stat">
              <span className="mb-stat__label">Active subscriptions</span>
              <span className="mb-stat__value">{analytics.active_subscriptions}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">New</span>
              <span className="mb-stat__value">{analytics.new_subscriptions}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Canceled</span>
              <span className="mb-stat__value">{analytics.canceled_subscriptions}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Churn (approx.)</span>
              <span className="mb-stat__value">
                {analytics.churn_rate_percent != null ? `${analytics.churn_rate_percent}%` : "—"}
              </span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Paid revenue</span>
              <span className="mb-stat__value">{formatMoney(analytics.revenue_cents, "usd")}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Paid invoices</span>
              <span className="mb-stat__value">{analytics.paid_invoices_count}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">MRR (approx.)</span>
              <span className="mb-stat__value">{formatMoney(analytics.mrr_cents_approx, "usd")}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-section" aria-labelledby="mb-subs-heading">
        <h2 id="mb-subs-heading" className="mb-section__title">
          Subscriptions
        </h2>
        <div className="mb-table-wrap">
          <table className="mb-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Student</th>
                <th>Product</th>
                <th>Period end</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="mb-muted">
                    No subscriptions yet.
                  </td>
                </tr>
              ) : (
                subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.status}</td>
                    <td>
                      <code style={{ fontSize: "0.8em" }}>{s.student_id}</code>
                    </td>
                    <td>
                      <code style={{ fontSize: "0.8em" }}>{s.product_id}</code>
                    </td>
                    <td>{formatDate(s.current_period_end)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-section" aria-labelledby="mb-inv-heading">
        <h2 id="mb-inv-heading" className="mb-section__title">
          Invoices (organization)
        </h2>
        <div className="mb-table-wrap">
          <table className="mb-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="mb-muted">
                    No invoices synced yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.status}</td>
                    <td>{formatMoney(inv.amount_cents, inv.currency)}</td>
                    <td>{formatDate(inv.paid_at)}</td>
                    <td>
                      {inv.hosted_invoice_url ? (
                        <a className="mb-link" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
