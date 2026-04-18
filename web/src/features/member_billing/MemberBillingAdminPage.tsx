import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { KidDropdown, KidSwitch } from "../../components/ui";
import {
  cancelMemberSubscription,
  createAdminMemberPaymentLink,
  createMemberProduct,
  getMemberBillingAnalytics,
  getMemberBillingConnectStatus,
  listMemberInvoicesAdmin,
  listMemberProductsAdmin,
  listMemberSubscriptionsAdmin,
  patchMemberBillingSettings,
  patchMemberProduct,
  startMemberBillingOnboarding,
  syncMemberBillingConnect,
  type MemberBillingAnalytics,
  type MemberBillingConnectStatus,
  type MemberInvoice,
  type MemberProduct,
  type MemberProductCreatePayload,
  type MemberProductUpdatePayload,
  type MemberSubscription,
  type TaxBehavior,
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
import {
  currencyCodeToDropdownValue,
  formatStripeCurrency,
  majorUnitsToStripeUnitAmount,
  MEMBER_BILLING_CURRENCY_OPTIONS,
  isStripeZeroDecimalCurrency,
  stripeUnitAmountToMajorString,
} from "./stripeCurrency";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function validateMajorAmountForStripe(
  amountMajorStr: string,
  currencyCode: string,
): { ok: true; amount_cents: number } | { ok: false; error: string } {
  const major = Number.parseFloat(amountMajorStr);
  if (Number.isNaN(major)) {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (!isStripeZeroDecimalCurrency(currencyCode) && major < 0.5) {
    return { ok: false, error: "For this currency, enter at least 0.50 in major units (e.g. $0.50)." };
  }
  if (isStripeZeroDecimalCurrency(currencyCode) && major < 50) {
    return { ok: false, error: "For this currency, enter at least 50 in whole units (Stripe minimum)." };
  }
  const amount_cents = majorUnitsToStripeUnitAmount(major, currencyCode);
  if (amount_cents < 50) {
    return { ok: false, error: "Amount is below Stripe’s usual minimum for this currency." };
  }
  return { ok: true, amount_cents };
}

function subscriptionCanCancelInApp(s: MemberSubscription): boolean {
  const st = (s.status || "").toLowerCase();
  if (!s.stripe_subscription_id) return false;
  if (st === "canceled" || st === "incomplete_expired") return false;
  return true;
}

/**
 * Modal overlay `data-testid` values for E2E (e.g. Playwright).
 * Escape-to-close is implemented in `MemberBillingAdminPage` via a document `keydown` listener (not on these nodes).
 *
 * Example (later): `await page.getByTestId(MEMBER_BILLING_MODAL_TEST_IDS.editProduct).waitFor(); await page.keyboard.press('Escape');`
 */
export const MEMBER_BILLING_MODAL_TEST_IDS = {
  editProduct: "member-billing-edit-product-modal",
  cancelSubscription: "member-billing-cancel-subscription-modal",
} as const;

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
  const [amountMajor, setAmountMajor] = useState("25");
  const [productCurrencySelect, setProductCurrencySelect] = useState("usd");
  const [productCurrencyOther, setProductCurrencyOther] = useState("");
  const [billingType, setBillingType] = useState<"one_time" | "recurring">("recurring");
  const [interval, setInterval] = useState<"month" | "quarter" | "year">("month");
  const [productTaxBehavior, setProductTaxBehavior] = useState<string>("default");
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

  const [editingProduct, setEditingProduct] = useState<MemberProduct | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eAmountMajor, setEAmountMajor] = useState("");
  const [eCurrencySelect, setECurrencySelect] = useState("usd");
  const [eCurrencyOther, setECurrencyOther] = useState("");
  const [eBillingType, setEBillingType] = useState<"one_time" | "recurring">("recurring");
  const [eInterval, setEInterval] = useState<"month" | "quarter" | "year">("month");
  const [eActive, setEActive] = useState(true);
  const [eTaxBehavior, setETaxBehavior] = useState<string>("default");
  const [eError, setEError] = useState<string | null>(null);
  const [eSaving, setESaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<MemberSubscription | null>(null);
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const payStudentOptions = useMemo(
    () => [
      { value: "", label: "Select…" },
      ...payStudents.map((s) => ({
        value: s.id,
        label: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.id,
      })),
    ],
    [payStudents],
  );

  const payPayerOptions = useMemo(() => {
    const rows = payParents
      .filter((p) => (p.user_email ?? "").trim())
      .map((p) => ({
        value: p.user_id,
        label: `${(p.user_email ?? "").trim()} (${p.relationship})`,
      }));
    return [{ value: "", label: "Default (guardian email, else learner)" }, ...rows];
  }, [payParents]);

  const payProductOptions = useMemo(
    () => [
      { value: "", label: "Select…" },
      ...products.map((p) => ({
        value: p.id,
        label: `${p.name}${!p.active ? " (inactive)" : ""}`,
        disabled: !p.active,
      })),
    ],
    [products],
  );

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      m.set(p.id, p.name);
    }
    return m;
  }, [products]);

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
    member_billing_tax_enabled?: boolean;
    member_billing_tax_behavior_default?: "exclusive" | "inclusive";
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
    const currencyCode =
      productCurrencySelect === "other"
        ? productCurrencyOther.trim().toLowerCase()
        : productCurrencySelect;
    if (productCurrencySelect === "other") {
      if (currencyCode.length !== 3 || !/^[a-z]{3}$/i.test(productCurrencyOther.trim())) {
        setProductError("Enter a 3-letter currency code (e.g. mad, huf).");
        return;
      }
    }
    const validated = validateMajorAmountForStripe(amountMajor, currencyCode);
    if (!validated.ok) {
      setProductError(validated.error);
      return;
    }
    const { amount_cents } = validated;
    const payload: MemberProductCreatePayload = {
      name: productName.trim(),
      description: productDesc.trim() || null,
      amount_cents,
      currency: currencyCode,
      billing_type: billingType,
      interval: billingType === "recurring" ? interval : null,
      tax_behavior: productTaxBehavior === "default" ? null : (productTaxBehavior as TaxBehavior),
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
      setProductTaxBehavior("default");
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

  const openEditProduct = (p: MemberProduct) => {
    const { select, other } = currencyCodeToDropdownValue(p.currency);
    setEditingProduct(p);
    setEName(p.name);
    setEDesc(p.description ?? "");
    setEAmountMajor(stripeUnitAmountToMajorString(p.amount_cents, p.currency));
    setECurrencySelect(select);
    setECurrencyOther(other);
    setEBillingType(p.billing_type === "one_time" ? "one_time" : "recurring");
    setEInterval(
      p.interval === "quarter" || p.interval === "year" || p.interval === "month"
        ? p.interval
        : "month",
    );
    setEActive(p.active);
    setETaxBehavior(p.tax_behavior ?? "default");
    setEError(null);
  };

  const closeEditProduct = () => {
    setEditingProduct(null);
    setEError(null);
    setESaving(false);
  };

  const onSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEError(null);
    const currencyCode =
      eCurrencySelect === "other" ? eCurrencyOther.trim().toLowerCase() : eCurrencySelect;
    if (eCurrencySelect === "other") {
      if (currencyCode.length !== 3 || !/^[a-z]{3}$/i.test(eCurrencyOther.trim())) {
        setEError("Enter a 3-letter currency code (e.g. mad, huf).");
        return;
      }
    }
    const validated = validateMajorAmountForStripe(eAmountMajor, currencyCode);
    if (!validated.ok) {
      setEError(validated.error);
      return;
    }
    if (!eName.trim()) {
      setEError("Name is required.");
      return;
    }
    setESaving(true);
    try {
      const body: MemberProductUpdatePayload = {
        name: eName.trim(),
        description: eDesc.trim() || null,
        active: eActive,
      };
      const pricingChanged =
        validated.amount_cents !== editingProduct.amount_cents ||
        currencyCode !== editingProduct.currency.toLowerCase() ||
        eBillingType !== editingProduct.billing_type ||
        (eBillingType === "recurring" && eInterval !== (editingProduct.interval ?? "")) ||
        (eBillingType === "one_time" && Boolean(editingProduct.interval));
      if (pricingChanged) {
        body.amount_cents = validated.amount_cents;
        body.currency = currencyCode;
        body.billing_type = eBillingType;
        body.interval = eBillingType === "recurring" ? eInterval : null;
      }
      const newTax = eTaxBehavior === "default" ? null : (eTaxBehavior as TaxBehavior);
      if (newTax !== (editingProduct.tax_behavior ?? null)) {
        body.tax_behavior = newTax;
      }
      await patchMemberProduct(editingProduct.id, body);
      closeEditProduct();
      await refresh();
    } catch (err) {
      setEError(
        err instanceof ApiHttpError
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : "Could not update product",
      );
    } finally {
      setESaving(false);
    }
  };

  const onConfirmCancelSubscription = async () => {
    if (!cancelTarget) return;
    setCancelError(null);
    setCancelBusy(true);
    try {
      await cancelMemberSubscription(cancelTarget.id, { immediate: cancelImmediate });
      setCancelTarget(null);
      setCancelImmediate(false);
      await refresh();
    } catch (err) {
      setCancelError(
        err instanceof ApiHttpError
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : "Could not cancel subscription",
      );
    } finally {
      setCancelBusy(false);
    }
  };

  /**
   * Dismiss modals with Escape (and block while save/cancel API in flight).
   * E2E: use {@link MEMBER_BILLING_MODAL_TEST_IDS} on the overlay + `page.keyboard.press('Escape')`.
   */
  useEffect(() => {
    if (!editingProduct && !cancelTarget) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (eSaving || cancelBusy) return;
      e.preventDefault();
      if (cancelTarget) {
        setCancelTarget(null);
        setCancelError(null);
        setCancelImmediate(false);
      } else {
        setEditingProduct(null);
        setEError(null);
        setESaving(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingProduct, cancelTarget, eSaving, cancelBusy]);

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
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <KidSwitch
                checked={status.member_billing_tax_enabled}
                onChange={(v) => void patchSetting({ member_billing_tax_enabled: v })}
                disabled={busy}
                ariaLabel="Collect tax on payments"
              />
              <span style={{ fontWeight: 700 }}>Collect tax on payments (via Stripe Tax)</span>
            </div>
            {status.member_billing_tax_enabled ? (
              <div style={{ marginLeft: "3rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <label style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Default tax behavior</label>
                <KidDropdown
                  value={status.member_billing_tax_behavior_default}
                  onChange={(v) => void patchSetting({ member_billing_tax_behavior_default: v as "exclusive" | "inclusive" })}
                  ariaLabel="Default tax behavior"
                  minWidth={240}
                  disabled={busy}
                  options={[
                    { value: "exclusive", label: "Exclusive (tax added on top)" },
                    { value: "inclusive", label: "Inclusive (price includes tax)" },
                  ]}
                />
                <span className="mb-muted" style={{ fontSize: "0.85rem" }}>
                  Configure tax registrations in your{" "}
                  <a
                    href="https://dashboard.stripe.com/settings/tax"
                    target="_blank"
                    rel="noreferrer"
                    className="mb-link"
                  >
                    Stripe Dashboard
                  </a>
                </span>
              </div>
            ) : null}
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
              <label
                htmlFor="mb-p-amt"
                style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "stretch" }}
              >
                <span>Amount</span>
                <input
                  id="mb-p-amt"
                  value={amountMajor}
                  onChange={(ev) => setAmountMajor(ev.target.value)}
                  inputMode="decimal"
                  disabled={busy}
                  aria-describedby="mb-p-amt-hint"
                />
                <span id="mb-p-amt-hint" className="mb-muted" style={{ fontSize: "0.8rem", fontWeight: 400 }}>
                  Major units for most currencies (e.g. 25.99); whole numbers for JPY, KRW, VND, etc.
                </span>
              </label>
              <label>
                Currency
                <KidDropdown
                  value={productCurrencySelect}
                  onChange={(v) => setProductCurrencySelect(v)}
                  ariaLabel="Price currency"
                  minWidth={200}
                  disabled={busy}
                  options={MEMBER_BILLING_CURRENCY_OPTIONS}
                />
              </label>
              {productCurrencySelect === "other" ? (
                <label htmlFor="mb-p-ccy-other">
                  ISO code
                  <input
                    id="mb-p-ccy-other"
                    value={productCurrencyOther}
                    onChange={(ev) => setProductCurrencyOther(ev.target.value.toUpperCase().slice(0, 3))}
                    placeholder="e.g. MAD"
                    maxLength={3}
                    disabled={busy}
                    autoComplete="off"
                  />
                </label>
              ) : null}
              <label>
                Billing
                <KidDropdown
                  value={billingType}
                  onChange={(v) =>
                    setBillingType(v === "one_time" ? "one_time" : "recurring")
                  }
                  ariaLabel="Billing type"
                  minWidth={180}
                  disabled={busy}
                  options={[
                    { value: "recurring", label: "Recurring" },
                    { value: "one_time", label: "One-time" },
                  ]}
                />
              </label>
              {billingType === "recurring" ? (
                <label>
                  Interval
                  <KidDropdown
                    value={interval}
                    onChange={(v) => setInterval(v as typeof interval)}
                    ariaLabel="Billing interval"
                    minWidth={180}
                    disabled={busy}
                    options={[
                      { value: "month", label: "Monthly" },
                      { value: "quarter", label: "Quarterly" },
                      { value: "year", label: "Yearly" },
                    ]}
                  />
                </label>
              ) : null}
              <label>
                Tax
                <KidDropdown
                  value={productTaxBehavior}
                  onChange={(v) => setProductTaxBehavior(v)}
                  ariaLabel="Tax behavior"
                  minWidth={220}
                  disabled={busy}
                  options={[
                    { value: "default", label: "Use org default" },
                    { value: "exclusive", label: "Tax exclusive (added on top)" },
                    { value: "inclusive", label: "Tax inclusive (in price)" },
                    { value: "none", label: "No tax" },
                  ]}
                />
              </label>
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
          <p className="mb-muted" style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.875rem" }}>
            Editing a product can change its name, description, or catalog visibility. Changing amount, currency, or
            billing schedule creates a new Stripe price; new checkouts use it, while existing subscriptions keep their
            current price until updated in Stripe.
          </p>
          <div className="mb-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="mb-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Tax</th>
                  <th>Active</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="mb-muted">
                      No products yet.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{formatStripeCurrency(p.amount_cents, p.currency)}</td>
                      <td>
                        {p.billing_type}
                        {p.interval ? ` · ${p.interval}` : ""}
                      </td>
                      <td>{p.tax_behavior ?? "Org default"}</td>
                      <td>{p.active ? "Yes" : "No"}</td>
                      {canManage ? (
                        <td>
                          <button
                            type="button"
                            className="mb-btn"
                            onClick={() => openEditProduct(p)}
                            disabled={busy || eSaving}
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
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
              <label style={{ minWidth: "12rem", flex: "1" }}>
                Learner
                <KidDropdown
                  value={payStudentId}
                  onChange={(v) => {
                    setPayStudentId(v);
                    setPayLinkUrl(null);
                  }}
                  ariaLabel="Learner for payment link"
                  placeholder="Select…"
                  fullWidth
                  disabled={payLinkBusy}
                  options={payStudentOptions}
                />
              </label>
              <label style={{ minWidth: "12rem", flex: "1" }}>
                Bill to (optional)
                <KidDropdown
                  value={payPayerUserId}
                  onChange={setPayPayerUserId}
                  ariaLabel="Bill to payer"
                  placeholder="Default (guardian email, else learner)"
                  fullWidth
                  disabled={payLinkBusy || !payStudentId}
                  options={payPayerOptions}
                />
              </label>
              <label style={{ minWidth: "12rem", flex: "1" }}>
                Product
                <KidDropdown
                  value={payProductId}
                  onChange={(v) => {
                    setPayProductId(v);
                    setPayLinkUrl(null);
                  }}
                  ariaLabel="Product for payment link"
                  placeholder="Select…"
                  fullWidth
                  disabled={payLinkBusy}
                  options={payProductOptions}
                />
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
              <span className="mb-stat__value">{formatStripeCurrency(analytics.revenue_cents, "usd")}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">Paid invoices</span>
              <span className="mb-stat__value">{analytics.paid_invoices_count}</span>
            </div>
            <div className="mb-stat">
              <span className="mb-stat__label">MRR (approx.)</span>
              <span className="mb-stat__value">{formatStripeCurrency(analytics.mrr_cents_approx, "usd")}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-section" aria-labelledby="mb-subs-heading">
        <h2 id="mb-subs-heading" className="mb-section__title">
          Subscriptions
        </h2>
        {canManage ? (
          <p className="mb-muted" style={{ marginTop: 0, fontSize: "0.875rem" }}>
            Cancel stops billing on the connected Stripe account. Default: access continues until the end of the current
            period unless you choose immediate cancel.
          </p>
        ) : null}
        <div className="mb-table-wrap">
          <table className="mb-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Student</th>
                <th>Product</th>
                <th>Period end</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="mb-muted">
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
                    <td title={s.product_id}>
                      {productNameById.get(s.product_id) ?? (
                        <code style={{ fontSize: "0.8em" }}>{s.product_id}</code>
                      )}
                    </td>
                    <td>{formatDate(s.current_period_end)}</td>
                    {canManage ? (
                      <td>
                        {subscriptionCanCancelInApp(s) ? (
                          <button
                            type="button"
                            className="mb-btn"
                            onClick={() => {
                              setCancelTarget(s);
                              setCancelImmediate(false);
                              setCancelError(null);
                            }}
                            disabled={cancelBusy}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="mb-muted">—</span>
                        )}
                      </td>
                    ) : null}
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
                    <td>{formatStripeCurrency(inv.amount_cents, inv.currency)}</td>
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

      {editingProduct ? (
        <div
          className="mb-modal-overlay"
          data-testid={MEMBER_BILLING_MODAL_TEST_IDS.editProduct}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mb-edit-product-title"
          onClick={() => !eSaving && closeEditProduct()}
        >
          <div className="mb-modal" onClick={(ev) => ev.stopPropagation()}>
            <h2 id="mb-edit-product-title" className="mb-modal__title">
              Edit product
            </h2>
            <form
              className="mb-modal__form"
              onSubmit={(ev) => void onSaveEditProduct(ev)}
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <div
                className="mb-form-row"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  marginBottom: 0,
                  gap: "0.75rem",
                  width: "100%",
                }}
              >
                <label htmlFor="mb-e-name">
                  Name
                  <input
                    id="mb-e-name"
                    value={eName}
                    onChange={(ev) => setEName(ev.target.value)}
                    placeholder="Monthly membership"
                    disabled={eSaving}
                  />
                </label>
                <div className="mb-form-row" style={{ marginBottom: 0, flexWrap: "wrap", width: "100%" }}>
                  <label
                    htmlFor="mb-e-amt"
                    style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "stretch" }}
                  >
                    <span>Amount</span>
                    <input
                      id="mb-e-amt"
                      value={eAmountMajor}
                      onChange={(ev) => setEAmountMajor(ev.target.value)}
                      inputMode="decimal"
                      disabled={eSaving}
                    />
                  </label>
                  <label>
                    Currency
                    <KidDropdown
                      value={eCurrencySelect}
                      onChange={(v) => setECurrencySelect(v)}
                      ariaLabel="Edit price currency"
                      minWidth={200}
                      disabled={eSaving}
                      options={MEMBER_BILLING_CURRENCY_OPTIONS}
                    />
                  </label>
                  {eCurrencySelect === "other" ? (
                    <label htmlFor="mb-e-ccy">
                      ISO code
                      <input
                        id="mb-e-ccy"
                        value={eCurrencyOther}
                        onChange={(ev) => setECurrencyOther(ev.target.value.toUpperCase().slice(0, 3))}
                        placeholder="e.g. MAD"
                        maxLength={3}
                        disabled={eSaving}
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                  <label>
                    Billing
                    <KidDropdown
                      value={eBillingType}
                      onChange={(v) => setEBillingType(v === "one_time" ? "one_time" : "recurring")}
                      ariaLabel="Edit billing type"
                      minWidth={180}
                      disabled={eSaving}
                      options={[
                        { value: "recurring", label: "Recurring" },
                        { value: "one_time", label: "One-time" },
                      ]}
                    />
                  </label>
                  {eBillingType === "recurring" ? (
                    <label>
                      Interval
                      <KidDropdown
                        value={eInterval}
                        onChange={(v) => setEInterval(v as typeof eInterval)}
                        ariaLabel="Edit billing interval"
                        minWidth={180}
                        disabled={eSaving}
                        options={[
                          { value: "month", label: "Monthly" },
                          { value: "quarter", label: "Quarterly" },
                          { value: "year", label: "Yearly" },
                        ]}
                      />
                    </label>
                  ) : null}
                  <label>
                    Tax
                    <KidDropdown
                      value={eTaxBehavior}
                      onChange={(v) => setETaxBehavior(v)}
                      ariaLabel="Edit tax behavior"
                      minWidth={220}
                      disabled={eSaving}
                      options={[
                        { value: "default", label: "Use org default" },
                        { value: "exclusive", label: "Tax exclusive (added on top)" },
                        { value: "inclusive", label: "Tax inclusive (in price)" },
                        { value: "none", label: "No tax" },
                      ]}
                    />
                  </label>
                </div>
                <label htmlFor="mb-e-desc" style={{ width: "100%" }}>
                  Description (optional)
                  <input
                    id="mb-e-desc"
                    value={eDesc}
                    onChange={(ev) => setEDesc(ev.target.value)}
                    disabled={eSaving}
                    style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <KidSwitch
                  checked={eActive}
                  onChange={setEActive}
                  disabled={eSaving}
                  ariaLabel="Product active in catalog"
                />
                <span style={{ fontWeight: 600 }}>Offer in checkout catalog</span>
              </div>
              {eError ? (
                <p className="mb-alert" style={{ margin: 0 }} role="alert">
                  {eError}
                </p>
              ) : null}
              <div className="mb-modal__actions">
                <button type="submit" className="mb-btn mb-btn--primary" disabled={eSaving}>
                  {eSaving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="mb-btn" onClick={closeEditProduct} disabled={eSaving}>
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {cancelTarget ? (
        <div
          className="mb-modal-overlay"
          data-testid={MEMBER_BILLING_MODAL_TEST_IDS.cancelSubscription}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mb-cancel-sub-title"
          onClick={() => !cancelBusy && setCancelTarget(null)}
        >
          <div className="mb-modal" onClick={(ev) => ev.stopPropagation()}>
            <h2 id="mb-cancel-sub-title" className="mb-modal__title">
              Cancel subscription
            </h2>
            <p className="mb-muted" style={{ marginTop: 0 }}>
              Status <strong>{cancelTarget.status}</strong>
              {cancelTarget.stripe_subscription_id ? (
                <>
                  {" "}
                  · Stripe{" "}
                  <code style={{ fontSize: "0.85em" }}>{cancelTarget.stripe_subscription_id}</code>
                </>
              ) : null}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <KidSwitch
                checked={cancelImmediate}
                onChange={setCancelImmediate}
                disabled={cancelBusy}
                ariaLabel="Cancel immediately"
              />
              <span style={{ fontWeight: 600 }}>Cancel immediately (ends access now)</span>
            </div>
            <p className="mb-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              If this is off, the subscription stays active until the current period ends, then Stripe stops renewing
              it.
            </p>
            {cancelError ? (
              <p className="mb-alert" style={{ marginTop: "0.75rem" }} role="alert">
                {cancelError}
              </p>
            ) : null}
            <div className="mb-modal__actions">
              <button
                type="button"
                className="mb-btn mb-btn--primary"
                disabled={cancelBusy}
                onClick={() => void onConfirmCancelSubscription()}
              >
                {cancelBusy ? "Canceling…" : "Confirm cancel"}
              </button>
              <button
                type="button"
                className="mb-btn"
                disabled={cancelBusy}
                onClick={() => setCancelTarget(null)}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
