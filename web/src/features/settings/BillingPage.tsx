import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, TrendingUp } from "lucide-react";
import { KidDropdown, ModalDialog, ProgressBar } from "../../components/ui";
import { ensureFreshAccessToken } from "../../lib/api/client";
import { listSeatUsage, type SeatUsageRecord } from "../../lib/api/licenses";
import { fetchPlanById, listPlans, type PlanRecord } from "../../lib/api/plans";
import {
  createCheckoutSession,
  cancelSubscription,
  type BillingCycle,
  listBillingProviders,
  pauseSubscription,
  reactivateSubscription,
  resumeSubscription,
  listSubscriptions,
  listTenantInvoices,
  type BillingProviderOption,
  type InvoiceRecord,
  type SubscriptionRecord,
} from "../../lib/api/subscriptions";
import { useAuth } from "../../providers/AuthProvider";
import "../../components/ui/ui.css";
import "./settings.css";

const SUBSCRIPTION_STATUS_PRIORITY = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "canceled",
];

function selectCurrentSubscription(
  rows: SubscriptionRecord[],
): SubscriptionRecord | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const aPriority = SUBSCRIPTION_STATUS_PRIORITY.indexOf(a.status.toLowerCase());
    const bPriority = SUBSCRIPTION_STATUS_PRIORITY.indexOf(b.status.toLowerCase());
    const aRank = aPriority === -1 ? SUBSCRIPTION_STATUS_PRIORITY.length : aPriority;
    const bRank = bPriority === -1 ? SUBSCRIPTION_STATUS_PRIORITY.length : bPriority;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return sorted[0] ?? null;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatMoneyFromCents(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amountCents / 100);
}

function statusClassName(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "paid" || normalized === "active") {
    return "billing-page__status--paid";
  }
  return "";
}

function getProviderLabel(provider?: string | null): string {
  const key = (provider || "").trim().toLowerCase();
  if (!key) return "Payment provider";
  if (key === "stripe") return "Stripe";
  if (key === "paypal") return "PayPal";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeBillingError(message: string): string {
  const text = message.trim().toLowerCase();
  if (
    text.includes("tenant context required") ||
    text.includes("x-tenant-id")
  ) {
    return "Choose an organization or school in the app (tenant), then open Billing again.";
  }
  if (
    text.includes("not authenticated") ||
    text.includes("session expired") ||
    text.includes("401")
  ) {
    return "Please sign in to view your billing data.";
  }
  return message;
}

export function BillingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutReturnStatus = searchParams.get("checkout");
  const hasLoadedBillingRef = useRef(false);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [subscribedPlanExtra, setSubscribedPlanExtra] = useState<PlanRecord | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [seatUsage, setSeatUsage] = useState<SeatUsageRecord[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [promoCode, setPromoCode] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutInfo, setCheckoutInfo] = useState("");
  const [billingProviders, setBillingProviders] = useState<BillingProviderOption[]>([]);
  const [paymentProvider, setPaymentProvider] = useState("stripe");
  const [subscriptionAction, setSubscriptionAction] = useState<
    "cancel" | "pause" | null
  >(null);
  const [subscriptionActionBusy, setSubscriptionActionBusy] = useState(false);
  const [subscriptionActionError, setSubscriptionActionError] = useState("");

  useEffect(() => {
    void listBillingProviders()
      .then((rows) => {
        setBillingProviders(rows);
        const preferred = rows.find((r) => r.available_for_checkout);
        if (preferred) {
          setPaymentProvider((prev) =>
            rows.some((r) => r.key === prev && r.available_for_checkout) ? prev : preferred.key,
          );
        }
      })
      .catch(() => setBillingProviders([]));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const checkoutState = query.get("checkout");
    if (checkoutState === "success") {
      setCheckoutInfo("Checkout completed successfully.");
    } else if (checkoutState === "cancelled") {
      setCheckoutInfo("Checkout was cancelled.");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      hasLoadedBillingRef.current = false;
      setPlans([]);
      setSubscriptions([]);
      setInvoices([]);
      setSeatUsage([]);
      setLoadError("");
      setInvoiceError("");
      setLoadingPlans(false);
      setLoadingInvoices(false);
      return;
    }
    if (hasLoadedBillingRef.current) {
      return;
    }
    hasLoadedBillingRef.current = true;
    async function loadBillingData() {
      setLoadingPlans(true);
      setLoadingInvoices(true);
      setLoadError("");
      setInvoiceError("");
      try {
        const canLoad = await ensureFreshAccessToken();
        if (!canLoad) {
          setLoadError("Your session has expired. Please log in again.");
          setPlans([]);
          setSubscriptions([]);
          setInvoices([]);
          setSeatUsage([]);
          return;
        }
        const [plansResult, subscriptionsResult, seatsResult, invoicesResult] =
          await Promise.allSettled([
            listPlans({ limit: 100 }),
            listSubscriptions({ limit: 50 }),
            listSeatUsage(),
            listTenantInvoices({ limit: 100 }),
          ]);
        const errors: string[] = [];

        if (plansResult.status === "fulfilled") {
          setPlans(plansResult.value.items);
        } else {
          errors.push(
            plansResult.reason instanceof Error
              ? normalizeBillingError(plansResult.reason.message)
              : "Unable to load plans",
          );
        }

        if (subscriptionsResult.status === "fulfilled") {
          setSubscriptions(subscriptionsResult.value.items);
        } else {
          errors.push(
            subscriptionsResult.reason instanceof Error
              ? normalizeBillingError(subscriptionsResult.reason.message)
              : "Unable to load subscriptions",
          );
        }

        if (seatsResult.status === "fulfilled") {
          setSeatUsage(seatsResult.value);
        } else {
          errors.push(
            seatsResult.reason instanceof Error
              ? normalizeBillingError(seatsResult.reason.message)
              : "Unable to load seat usage",
          );
        }

        if (invoicesResult.status === "fulfilled") {
          setInvoices(invoicesResult.value.items);
        } else {
          setInvoices([]);
          const msg =
            invoicesResult.reason instanceof Error
              ? normalizeBillingError(invoicesResult.reason.message)
              : "Unable to load billing history";
          setInvoiceError(msg);
        }

        if (errors.length > 0) {
          setLoadError(errors.join(". "));
        }
        if (plansResult.status === "fulfilled" && plansResult.value.items.length > 0) {
          const current = subscriptionsResult.status === "fulfilled"
            ? selectCurrentSubscription(subscriptionsResult.value.items)
            : null;
          const planItems = plansResult.value.items;
          const preferredPlanId =
            current && planItems.some((plan) => plan.id === current.plan_id)
              ? current.plan_id
              : planItems[0].id;
          setSelectedPlanId((prev) => prev || preferredPlanId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load billing data";
        setLoadError(message);
      } finally {
        setLoadingPlans(false);
        setLoadingInvoices(false);
      }
    }
    void loadBillingData();
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (checkoutReturnStatus !== "success" || authLoading || !user?.id) {
      return;
    }
    let cancelled = false;
    async function refetchSubscriptions() {
      const canLoad = await ensureFreshAccessToken();
      if (!canLoad || cancelled) return;
      try {
        const [subRes, invRes] = await Promise.all([
          listSubscriptions({ limit: 50 }),
          listTenantInvoices({ limit: 100 }),
        ]);
        if (!cancelled) {
          setSubscriptions(subRes.items);
          setInvoices(invRes.items);
        }
      } catch {
        /* ignore — main load effect will surface errors on next visit */
      }
    }
    void refetchSubscriptions();
    const t1 = window.setTimeout(() => void refetchSubscriptions(), 2000);
    const t2 = window.setTimeout(() => void refetchSubscriptions(), 6000);
    const tClear = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("checkout");
          return next;
        },
        { replace: true },
      );
    }, 8000);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tClear);
    };
  }, [checkoutReturnStatus, authLoading, user?.id, setSearchParams]);

  const currentSubscription = useMemo(
    () => selectCurrentSubscription(subscriptions),
    [subscriptions],
  );
  const currentSubscriptionStatus = (currentSubscription?.status ?? "").toLowerCase();
  const isPaused = currentSubscriptionStatus === "paused";
  const isCancelScheduled = Boolean(currentSubscription?.canceled_at);

  useEffect(() => {
    const pid = currentSubscription?.plan_id;
    if (!pid) {
      setSubscribedPlanExtra(null);
      return;
    }
    if (plans.some((p) => p.id === pid)) {
      setSubscribedPlanExtra(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const plan = await fetchPlanById(pid);
        if (!cancelled) {
          setSubscribedPlanExtra(plan);
        }
      } catch {
        if (!cancelled) {
          setSubscribedPlanExtra(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSubscription?.plan_id, plans]);

  const currentPlan = useMemo(() => {
    if (!currentSubscription) return null;
    return (
      plans.find((plan) => plan.id === currentSubscription.plan_id) ??
      subscribedPlanExtra ??
      null
    );
  }, [plans, currentSubscription, subscribedPlanExtra]);

  const paymentProviderLabel = useMemo(
    () => getProviderLabel(currentSubscription?.provider),
    [currentSubscription?.provider],
  );

  const paymentCustomerId = useMemo(
    () =>
      currentSubscription?.provider_customer_id ||
      currentSubscription?.stripe_customer_id ||
      null,
    [currentSubscription?.provider_customer_id, currentSubscription?.stripe_customer_id],
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );
  const planOptions = useMemo(
    () => plans.map((plan) => ({ value: plan.id, label: plan.name })),
    [plans],
  );
  const billingCycleOptions = useMemo(
    () => [
      { value: "monthly", label: "Monthly" },
      { value: "yearly", label: "Yearly" },
    ],
    [],
  );
  const selectedPrice = useMemo(() => {
    if (!selectedPlan) return null;
    return billingCycle === "yearly"
      ? selectedPlan.price_yearly
      : selectedPlan.price_monthly;
  }, [selectedPlan, billingCycle]);
  const selectedSeats = useMemo(() => {
    if (!selectedPlan) return null;
    const limit = selectedPlan.limits.find((item) => item.limit_key === "max_students");
    return limit?.limit_value ?? null;
  }, [selectedPlan]);

  const effectivePaymentProvider =
    billingProviders.length === 0 ? "stripe" : paymentProvider;

  const checkoutReadyForProvider = useMemo(() => {
    if (!selectedPlan) return false;
    if (effectivePaymentProvider === "stripe") {
      if (billingCycle === "yearly") {
        if (typeof selectedPlan.stripe_checkout_yearly_ready === "boolean") {
          return selectedPlan.stripe_checkout_yearly_ready;
        }
        return Boolean((selectedPlan.stripe_price_id_yearly ?? "").trim());
      }
      if (typeof selectedPlan.stripe_checkout_monthly_ready === "boolean") {
        return selectedPlan.stripe_checkout_monthly_ready;
      }
      return Boolean((selectedPlan.stripe_price_id_monthly ?? "").trim());
    }
    return false;
  }, [selectedPlan, billingCycle, effectivePaymentProvider]);

  const providerDropdownOptions = useMemo(
    () =>
      billingProviders.map((p) => ({
        value: p.key,
        label: p.available_for_checkout ? p.label : `${p.label} — not available`,
        disabled: !p.available_for_checkout,
      })),
    [billingProviders],
  );

  const selectedProviderMeta = useMemo(
    () => billingProviders.find((p) => p.key === effectivePaymentProvider),
    [billingProviders, effectivePaymentProvider],
  );

  const studentSeatUsage = useMemo(() => {
    return (
      seatUsage.find((row) => row.seat_type.toLowerCase() === "student") ??
      seatUsage[0] ??
      null
    );
  }, [seatUsage]);

  const usagePercent = useMemo(() => {
    if (!studentSeatUsage || studentSeatUsage.max_count <= 0) return 0;
    return Math.min(
      100,
      Math.round((studentSeatUsage.current_count / studentSeatUsage.max_count) * 100),
    );
  }, [studentSeatUsage]);

  async function handleStartCheckout() {
    if (!selectedPlanId) {
      setCheckoutError("Please select a plan.");
      return;
    }
    setCheckoutError("");
    setCheckoutInfo("");
    setStartingCheckout(true);
    try {
      const baseUrl = window.location.origin;
      const response = await createCheckoutSession({
        plan_id: selectedPlanId,
        billing_cycle: billingCycle,
        success_url: `${baseUrl}/app/billing?checkout=success`,
        cancel_url: `${baseUrl}/app/billing?checkout=cancelled`,
        promo_code: promoCode.trim() || null,
        affiliate_code: affiliateCode.trim() || null,
        payment_provider: effectivePaymentProvider,
      });
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
      setCheckoutInfo(`Checkout session created: ${response.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create checkout session.";
      setCheckoutError(message);
    } finally {
      setStartingCheckout(false);
    }
  }

  async function refreshBillingSnapshot() {
    const [subRes, invRes] = await Promise.all([
      listSubscriptions({ limit: 50 }),
      listTenantInvoices({ limit: 100 }),
    ]);
    setSubscriptions(subRes.items);
    setInvoices(invRes.items);
  }

  async function handleConfirmPauseOrCancel() {
    if (!currentSubscription?.id || !subscriptionAction) return;
    setSubscriptionActionBusy(true);
    setSubscriptionActionError("");
    try {
      if (subscriptionAction === "pause") {
        await pauseSubscription(currentSubscription.id);
      } else {
        await cancelSubscription(currentSubscription.id);
      }
      await refreshBillingSnapshot();
      setSubscriptionAction(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update subscription.";
      setSubscriptionActionError(message);
    } finally {
      setSubscriptionActionBusy(false);
    }
  }

  async function handleResumeBilling() {
    if (!currentSubscription?.id) return;
    setSubscriptionActionError("");
    setSubscriptionActionBusy(true);
    try {
      await resumeSubscription(currentSubscription.id);
      await refreshBillingSnapshot();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not resume subscription.";
      setSubscriptionActionError(message);
    } finally {
      setSubscriptionActionBusy(false);
    }
  }

  async function handleUndoCancel() {
    if (!currentSubscription?.id) return;
    setSubscriptionActionError("");
    setSubscriptionActionBusy(true);
    try {
      await reactivateSubscription(currentSubscription.id);
      await refreshBillingSnapshot();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reactivate subscription.";
      setSubscriptionActionError(message);
    } finally {
      setSubscriptionActionBusy(false);
    }
  }

  return (
    <div className="billing-page" role="main" aria-label="Billing">
      <header className="billing-page__header">
        <h1 className="billing-page__title">Billing</h1>
        <p className="billing-page__subtitle">
          Manage your subscription and payment methods
        </p>
      </header>

      <div className="billing-page__content">
        {/* Current Plan */}
        <section className="billing-page__card" aria-labelledby="plan-heading">
          <h2 id="plan-heading" className="billing-page__card-title">
            Current Plan
          </h2>
          <div className="billing-page__plan">
            <div className="billing-page__plan-name">
              {currentPlan?.name ?? "No active plan"}
            </div>
            <div className="billing-page__plan-price">
              {currentPlan?.price_monthly != null
                ? `$${currentPlan.price_monthly}/mo`
                : currentPlan?.price_yearly != null
                  ? `$${currentPlan.price_yearly}/yr`
                  : "-"}
            </div>
            <div className="billing-page__plan-seats">
              {currentSubscription
                ? `Status: ${currentSubscription.status}`
                : "No subscription found"}
            </div>
            {!currentSubscription && !loadingPlans && (
              <p className="billing-page__usage-text" style={{ marginTop: "0.75rem" }}>
                Paid subscriptions are stored per workspace. Use the same organization in the header
                as when you started checkout. After returning from Stripe, wait a few seconds for
                webhooks—this page rechecks automatically when the URL includes{" "}
                <code className="billing-page__code">checkout=success</code>.
              </p>
            )}
            {currentSubscription && (
              <div className="billing-page__subscription-actions">
                {isPaused ? (
                  <button
                    type="button"
                    className="billing-page__btn-secondary"
                    onClick={() => void handleResumeBilling()}
                    disabled={subscriptionActionBusy}
                  >
                    Resume billing
                  </button>
                ) : (
                  <button
                    type="button"
                    className="billing-page__btn-secondary"
                    onClick={() => setSubscriptionAction("pause")}
                    disabled={subscriptionActionBusy}
                  >
                    Pause subscription
                  </button>
                )}
                {isCancelScheduled ? (
                  <button
                    type="button"
                    className="billing-page__btn-secondary"
                    onClick={() => void handleUndoCancel()}
                    disabled={subscriptionActionBusy}
                  >
                    Undo cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="billing-page__btn-secondary billing-page__btn-secondary--danger"
                    onClick={() => setSubscriptionAction("cancel")}
                    disabled={subscriptionActionBusy}
                  >
                    Cancel at period end
                  </button>
                )}
              </div>
            )}
            {subscriptionActionError && (
              <p className="billing-page__flash billing-page__flash--error">
                {subscriptionActionError}
              </p>
            )}
          </div>
        </section>

        {/* Usage */}
        <section className="billing-page__card" aria-labelledby="usage-heading">
          <h2 id="usage-heading" className="billing-page__card-title">
            Usage
          </h2>
          <ProgressBar
            value={usagePercent}
            label="Seats used"
            showPercent
            variant="default"
          />
          <p className="billing-page__usage-text">
            {studentSeatUsage
              ? `${studentSeatUsage.current_count} / ${studentSeatUsage.max_count} ${studentSeatUsage.seat_type} seats`
              : "Seat usage unavailable"}
          </p>
        </section>

        {/* Payment method */}
        <section
          className="billing-page__card"
          aria-labelledby="payment-heading"
        >
          <h2 id="payment-heading" className="billing-page__card-title">
            Payment Method
          </h2>
          <div className="billing-page__payment">
            <CreditCard size={20} aria-hidden />
            <span>
              {paymentCustomerId
                ? `Managed by ${paymentProviderLabel} (${paymentCustomerId})`
                : "No saved payment method on file"}
            </span>
          </div>
        </section>

        {/* Billing history */}
        <section
          className="billing-page__card"
          aria-labelledby="history-heading"
        >
          <h2 id="history-heading" className="billing-page__card-title">
            Billing History
          </h2>
          <p className="billing-page__usage-text" style={{ marginBottom: "0.75rem" }}>
            Invoices for this workspace across all organization subscriptions (platform billing).
          </p>
          <div className="billing-page__table-wrapper">
            <table className="billing-page__table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.paid_at || row.created_at)}</td>
                    <td>{formatMoneyFromCents(row.amount_cents, row.currency)}</td>
                    <td>
                      <span
                        className={`billing-page__status ${statusClassName(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && !loadingInvoices && (
                  <tr>
                    <td colSpan={3}>No invoices yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {loadingInvoices && (
            <p className="billing-page__flash billing-page__flash--info">
              Loading billing history...
            </p>
          )}
          {invoiceError && (
            <p className="billing-page__flash billing-page__flash--error">
              {invoiceError}
            </p>
          )}
        </section>

        {/* Upgrade */}
        <div className="billing-page__actions billing-page__actions--stack">
          <section className="billing-page__checkout-panel" aria-label="Checkout options">
            <div className="billing-page__checkout-grid">
              <label className="billing-page__field">
                <span>Payment method</span>
                <KidDropdown
                  value={paymentProvider}
                  options={providerDropdownOptions}
                  onChange={setPaymentProvider}
                  ariaLabel="Payment provider"
                  placeholder="Select provider"
                  disabled={startingCheckout || providerDropdownOptions.length === 0}
                  fullWidth
                />
              </label>
              <label className="billing-page__field">
                <span>Plan</span>
                <KidDropdown
                  value={selectedPlanId}
                  options={planOptions}
                  onChange={setSelectedPlanId}
                  ariaLabel="Plan"
                  placeholder="Select a plan"
                  disabled={loadingPlans || startingCheckout}
                  fullWidth
                />
              </label>
              <label className="billing-page__field">
                <span>Billing cycle</span>
                <KidDropdown
                  value={billingCycle}
                  options={billingCycleOptions}
                  onChange={(value) => setBillingCycle(value as BillingCycle)}
                  ariaLabel="Billing cycle"
                  disabled={startingCheckout}
                  fullWidth
                />
              </label>
              <label className="billing-page__field">
                <span>Promo code</span>
                <input
                  className="billing-page__input"
                  type="text"
                  placeholder="Optional"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  disabled={startingCheckout}
                  maxLength={64}
                />
              </label>
              <label className="billing-page__field">
                <span>Affiliate code</span>
                <input
                  className="billing-page__input"
                  type="text"
                  placeholder="Optional"
                  value={affiliateCode}
                  onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                  disabled={startingCheckout}
                  maxLength={64}
                />
              </label>
            </div>
            {selectedPlan && (
              <p className="billing-page__usage-text">
                Selected:{" "}
                {selectedPrice != null
                  ? `$${selectedPrice}/${billingCycle === "yearly" ? "yr" : "mo"}`
                  : "Custom pricing"}
                {selectedSeats != null ? ` • Up to ${selectedSeats} students` : ""}
              </p>
            )}
            {selectedPlan && effectivePaymentProvider === "stripe" && !checkoutReadyForProvider && (
              <p className="billing-page__flash billing-page__flash--error">
                Stripe checkout isn’t set up for this plan’s {billingCycle} billing yet. Add
                stripe_price_id_{billingCycle === "yearly" ? "yearly" : "monthly"} in{" "}
                backend/config/plan_registry.json (then run{" "}
                <code className="billing-page__code">python -m app.manage db seed</code>) or update the
                plan in the database. In local development you can set{" "}
                STRIPE_DEV_FALLBACK_PRICE_MONTHLY / STRIPE_DEV_FALLBACK_PRICE_YEARLY in backend{" "}
                <code className="billing-page__code">.env</code>.
              </p>
            )}
            {selectedProviderMeta?.description && (
              <p className="billing-page__usage-text" style={{ marginTop: "0.5rem" }}>
                {selectedProviderMeta.description}
              </p>
            )}
            {checkoutError && (
              <p className="billing-page__flash billing-page__flash--error">{checkoutError}</p>
            )}
            {checkoutInfo && (
              <p className="billing-page__flash billing-page__flash--info">{checkoutInfo}</p>
            )}
            {loadError && (
              <p className="billing-page__flash billing-page__flash--error">{loadError}</p>
            )}
          </section>
          <button
            type="button"
            className="billing-page__btn-primary"
            onClick={() => void handleStartCheckout()}
            disabled={
              loadingPlans ||
              startingCheckout ||
              !selectedPlanId ||
              !checkoutReadyForProvider
            }
          >
            <TrendingUp size={18} aria-hidden />
            {startingCheckout ? "Starting checkout..." : "Upgrade Plan"}
          </button>
        </div>
      </div>
      <ModalDialog
        isOpen={subscriptionAction != null}
        onClose={() => {
          if (subscriptionActionBusy) return;
          setSubscriptionAction(null);
          setSubscriptionActionError("");
        }}
        title={
          subscriptionAction === "pause"
            ? "Pause subscription"
            : "Cancel subscription"
        }
        ariaLabel={
          subscriptionAction === "pause"
            ? "Pause subscription"
            : "Cancel subscription"
        }
        footer={
          <div className="ui-form-actions">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => {
                setSubscriptionAction(null);
                setSubscriptionActionError("");
              }}
              disabled={subscriptionActionBusy}
            >
              Keep as is
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => void handleConfirmPauseOrCancel()}
              disabled={subscriptionActionBusy}
            >
              {subscriptionActionBusy
                ? "Saving..."
                : subscriptionAction === "pause"
                  ? "Pause now"
                  : "Confirm cancel"}
            </button>
          </div>
        }
      >
        <p className="billing-page__usage-text" style={{ marginTop: 0 }}>
          {subscriptionAction === "pause"
            ? "Pausing stops upcoming billing collection until you resume."
            : "Your subscription will remain active until the end of the current billing period."}
        </p>
      </ModalDialog>
    </div>
  );
}
