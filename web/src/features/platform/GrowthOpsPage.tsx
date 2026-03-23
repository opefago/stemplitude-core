import { useEffect, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import tippy, { type Instance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import "tippy.js/themes/light-border.css";
import {
  createAffiliate,
  createPromo,
  downloadCsvWithAuth,
  getCommissionFileExportUrl,
  getPayoutFileExportUrl,
  listAffiliates,
  listCommissions,
  listPromos,
  updateCommissionStatus,
  type AffiliateRecord,
  type CommissionRecord,
  type PromoCodeRecord,
} from "../../lib/api/growth";
import { DateTimePicker, KidCheckbox, KidDropdown } from "../../components/ui";
import "./growth-ops.css";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function FieldHint({ label, hint }: { label: string; hint: string }) {
  const [node, setNode] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!node) return;
    const tooltipHtml = `<div class="growth-ops__tippy"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(hint)}</span></div>`;
    const instance: Instance = tippy(node, {
      content: tooltipHtml,
      allowHTML: true,
      theme: "growth-ops-hint",
      placement: "top",
      interactive: false,
      maxWidth: 320,
      appendTo: () => document.body,
    });
    return () => {
      instance.destroy();
    };
  }, [hint, label, node]);

  return (
    <button
      ref={setNode}
      className="growth-ops__hint-btn"
      type="button"
      aria-label={`${label} help`}
    >
      <CircleHelp size={14} />
    </button>
  );
}

export function GrowthOpsPage() {
  const [activeTab, setActiveTab] = useState<"promos" | "affiliates" | "commissions">("promos");
  const [promos, setPromos] = useState<PromoCodeRecord[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promoQuery, setPromoQuery] = useState("");
  const [promoDiscountFilter, setPromoDiscountFilter] = useState<"all" | "percent" | "fixed">("all");
  const [affiliateQuery, setAffiliateQuery] = useState("");
  const [affiliateStatusFilter, setAffiliateStatusFilter] = useState<"all" | "active" | "paused" | "inactive">("all");
  const [commissionQuery, setCommissionQuery] = useState("");
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<
    "all" | "accrued" | "pending" | "approved" | "available" | "paid" | "reversed"
  >("all");

  const [promoForm, setPromoForm] = useState({
    code: "",
    name: "",
    provider: "stripe",
    discount_type: "percent",
    discount_value: "10",
    starts_at: "",
    ends_at: "",
    max_redemptions: "",
    per_customer_limit: "",
    first_time_only: false,
    provider_coupon_ref: "",
    provider_promo_ref: "",
  });

  const [affiliateForm, setAffiliateForm] = useState({
    name: "",
    code: "",
    status: "active",
    payout_email: "",
    commission_type: "percent",
    commission_value: "20",
    commission_mode: "one_time",
    commission_window_days: "365",
    max_commission_cycles: "1",
    attribution_model: "last_touch",
    payout_hold_days: "30",
  });

  const canCreatePromo = useMemo(
    () => promoForm.code.trim() && promoForm.name.trim(),
    [promoForm.code, promoForm.name],
  );
  const canCreateAffiliate = useMemo(
    () => affiliateForm.code.trim() && affiliateForm.name.trim(),
    [affiliateForm.code, affiliateForm.name],
  );
  const filteredPromos = useMemo(() => {
    const query = promoQuery.trim().toLowerCase();
    return promos.filter((promo) => {
      const matchesQuery =
        !query ||
        promo.code.toLowerCase().includes(query) ||
        promo.name.toLowerCase().includes(query);
      const matchesDiscount = promoDiscountFilter === "all" || promo.discount_type === promoDiscountFilter;
      return matchesQuery && matchesDiscount;
    });
  }, [promos, promoQuery, promoDiscountFilter]);
  const filteredAffiliates = useMemo(() => {
    const query = affiliateQuery.trim().toLowerCase();
    return affiliates.filter((affiliate) => {
      const matchesQuery =
        !query ||
        affiliate.code.toLowerCase().includes(query) ||
        affiliate.name.toLowerCase().includes(query);
      const matchesStatus = affiliateStatusFilter === "all" || affiliate.status === affiliateStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [affiliates, affiliateQuery, affiliateStatusFilter]);
  const filteredCommissions = useMemo(() => {
    const query = commissionQuery.trim().toLowerCase();
    return commissions.filter((commission) => {
      const matchesQuery =
        !query ||
        commission.id.toLowerCase().includes(query) ||
        commission.currency.toLowerCase().includes(query);
      const matchesStatus = commissionStatusFilter === "all" || commission.status === commissionStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [commissions, commissionQuery, commissionStatusFilter]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [promoRows, affiliateRows, commissionRows] = await Promise.all([
        listPromos(),
        listAffiliates(),
        listCommissions(),
      ]);
      setPromos(promoRows);
      setAffiliates(affiliateRows);
      setCommissions(commissionRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load growth data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreatePromo() {
    if (!promoForm.code.trim() || !promoForm.name.trim()) {
      setError("Promo code and name are required.");
      return;
    }
    if (promoForm.starts_at && promoForm.ends_at && promoForm.ends_at <= promoForm.starts_at) {
      setError("End time must be after start time.");
      return;
    }
    setError("");
    await createPromo({
      code: promoForm.code.trim().toUpperCase(),
      name: promoForm.name.trim(),
      provider: promoForm.provider,
      discount_type: promoForm.discount_type as "percent" | "fixed",
      discount_value: Number(promoForm.discount_value),
      starts_at: promoForm.starts_at || null,
      ends_at: promoForm.ends_at || null,
      max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
      per_customer_limit: promoForm.per_customer_limit ? Number(promoForm.per_customer_limit) : null,
      first_time_only: promoForm.first_time_only,
      provider_mappings: {
        provider_coupon_ref: promoForm.provider_coupon_ref || null,
        provider_promo_ref: promoForm.provider_promo_ref || null,
      },
    });
    setPromoForm((p) => ({ ...p, code: "", name: "" }));
    await load();
  }

  async function handleCreateAffiliate() {
    if (!affiliateForm.code.trim() || !affiliateForm.name.trim()) {
      setError("Affiliate code and name are required.");
      return;
    }
    setError("");
    await createAffiliate({
      name: affiliateForm.name.trim(),
      code: affiliateForm.code.trim().toUpperCase(),
      status: affiliateForm.status,
      payout_email: affiliateForm.payout_email || null,
      commission_type: affiliateForm.commission_type as "percent" | "fixed",
      commission_value: Number(affiliateForm.commission_value),
      commission_mode: affiliateForm.commission_mode as "one_time" | "recurring",
      commission_window_days: Number(affiliateForm.commission_window_days),
      max_commission_cycles: Number(affiliateForm.max_commission_cycles),
      attribution_model: affiliateForm.attribution_model as "first_touch" | "last_touch",
      payout_hold_days: Number(affiliateForm.payout_hold_days),
    });
    setAffiliateForm((p) => ({ ...p, name: "", code: "", payout_email: "" }));
    await load();
  }

  async function setCommissionPaid(id: string) {
    await updateCommissionStatus(id, "paid");
    await load();
  }

  function formatStatus(value: string): string {
    return value
      .split("_")
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  return (
    <div className="growth-ops">
      <header className="growth-ops__hero">
        <div>
          <h1>Growth Ops</h1>
          <p>Manage promos, affiliates, commissions, and payout-file operations.</p>
        </div>
      </header>

      <nav className="growth-ops__tabs" aria-label="Growth Ops sections">
        <button
          type="button"
          className={`growth-ops__tab${activeTab === "promos" ? " growth-ops__tab--active" : ""}`}
          onClick={() => setActiveTab("promos")}
        >
          Promos
        </button>
        <button
          type="button"
          className={`growth-ops__tab${activeTab === "affiliates" ? " growth-ops__tab--active" : ""}`}
          onClick={() => setActiveTab("affiliates")}
        >
          Affiliates
        </button>
        <button
          type="button"
          className={`growth-ops__tab${activeTab === "commissions" ? " growth-ops__tab--active" : ""}`}
          onClick={() => setActiveTab("commissions")}
        >
          Commissions & Payouts
        </button>
      </nav>

      {error && <p className="growth-ops__error">{error}</p>}

      {activeTab === "promos" && (
      <section className="growth-ops__card">
        <div className="growth-ops__title-row">
          <h2>Create promo</h2>
          <a className="growth-ops__field-help-link" href="/app/platform/growth/help">
            Field help
          </a>
        </div>
        <div className="growth-ops__form-grid">
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Promo code <FieldHint label="Promo code" hint="Unique customer-facing code entered during checkout." /></span>
            <input
              type="text"
              value={promoForm.code}
              onChange={(e) => setPromoForm((p) => ({ ...p, code: e.target.value }))}
              required
              minLength={2}
              maxLength={64}
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Promo name <FieldHint label="Promo name" hint="Internal campaign label for operations and reporting." /></span>
            <input
              type="text"
              value={promoForm.name}
              onChange={(e) => setPromoForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Discount type <FieldHint label="Discount type" hint="Choose percent for relative discount or fixed for absolute amount." /></span>
            <KidDropdown
              value={promoForm.discount_type}
              options={[
                { value: "percent", label: "Percent (%)" },
                { value: "fixed", label: "Fixed amount" },
              ]}
              onChange={(value) => setPromoForm((p) => ({ ...p, discount_type: value }))}
              fullWidth
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Percent off <FieldHint label="Percent off / amount" hint="Numeric discount value based on discount type selection." /></span>
            <input
              type="number"
              min={0}
              max={promoForm.discount_type === "percent" ? 100 : 999999}
              step={promoForm.discount_type === "percent" ? 0.1 : 1}
              value={promoForm.discount_value}
              onChange={(e) => setPromoForm((p) => ({ ...p, discount_value: e.target.value }))}
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Max redemptions <FieldHint label="Max redemptions" hint="Global usage cap across all customers." /></span>
            <input
              type="number"
              min={1}
              step={1}
              value={promoForm.max_redemptions}
              onChange={(e) => setPromoForm((p) => ({ ...p, max_redemptions: e.target.value }))}
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Per customer limit <FieldHint label="Per customer limit" hint="Maximum number of times one customer can use this promo." /></span>
            <input
              type="number"
              min={1}
              step={1}
              value={promoForm.per_customer_limit}
              onChange={(e) => setPromoForm((p) => ({ ...p, per_customer_limit: e.target.value }))}
            />
          </label>
          <label className="growth-ops__field growth-ops__field--datetime">
            <span className="growth-ops__field-label">Starts at <FieldHint label="Starts at" hint="Promo is valid only on or after this datetime." /></span>
            <DateTimePicker
              value={promoForm.starts_at}
              onChange={(v) => setPromoForm((p) => ({ ...p, starts_at: v }))}
              datePopoverClassName="growth-ops__date-popover"
              timePopoverClassName="growth-ops__time-popover"
            />
          </label>
          <label className="growth-ops__field growth-ops__field--datetime">
            <span className="growth-ops__field-label">Ends at <FieldHint label="Ends at" hint="Promo expires after this datetime." /></span>
            <DateTimePicker
              value={promoForm.ends_at}
              onChange={(v) => setPromoForm((p) => ({ ...p, ends_at: v }))}
              datePopoverClassName="growth-ops__date-popover"
              timePopoverClassName="growth-ops__time-popover"
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Provider coupon ref <FieldHint label="Provider coupon reference" hint="External provider coupon identifier (provider-neutral mapping)." /></span>
            <input
              type="text"
              value={promoForm.provider_coupon_ref}
              onChange={(e) => setPromoForm((p) => ({ ...p, provider_coupon_ref: e.target.value }))}
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Provider promo ref <FieldHint label="Provider promo reference" hint="External provider promotion identifier (provider-neutral mapping)." /></span>
            <input
              type="text"
              value={promoForm.provider_promo_ref}
              onChange={(e) => setPromoForm((p) => ({ ...p, provider_promo_ref: e.target.value }))}
            />
          </label>
          <KidCheckbox
            checked={promoForm.first_time_only}
            onChange={(checked) => setPromoForm((p) => ({ ...p, first_time_only: checked }))}
          >
            First-time customers only
          </KidCheckbox>
        </div>
        <div className="growth-ops__row">
          <button type="button" className="growth-ops__btn growth-ops__btn--block" onClick={() => void handleCreatePromo()} disabled={!canCreatePromo}>
            Create promo
          </button>
        </div>
      </section>
      )}

      {activeTab === "affiliates" && (
      <section className="growth-ops__card">
        <div className="growth-ops__title-row">
          <h2>Create affiliate</h2>
          <a className="growth-ops__field-help-link" href="/app/platform/growth/help">
            Field help
          </a>
        </div>
        <div className="growth-ops__form-grid">
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Affiliate name <FieldHint label="Affiliate name" hint="Partner or brand display name." /></span>
            <input type="text" value={affiliateForm.name} onChange={(e) => setAffiliateForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Affiliate code <FieldHint label="Affiliate code" hint="Referral code used to attribute checkout conversions." /></span>
            <input type="text" value={affiliateForm.code} onChange={(e) => setAffiliateForm((p) => ({ ...p, code: e.target.value }))} />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Payout email <FieldHint label="Payout email" hint="Destination contact used during payout reconciliation." /></span>
            <input type="email" value={affiliateForm.payout_email} onChange={(e) => setAffiliateForm((p) => ({ ...p, payout_email: e.target.value }))} />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Commission type <FieldHint label="Commission type" hint="Percent calculates from invoice amount; fixed uses a flat amount." /></span>
            <KidDropdown
              value={affiliateForm.commission_type}
              options={[
                { value: "percent", label: "Percent (%)" },
                { value: "fixed", label: "Fixed amount" },
              ]}
              onChange={(value) => setAffiliateForm((p) => ({ ...p, commission_type: value }))}
              fullWidth
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Commission value <FieldHint label="Commission value" hint="Numeric commission amount interpreted by commission type." /></span>
            <input type="number" min={0} step={0.1} value={affiliateForm.commission_value} onChange={(e) => setAffiliateForm((p) => ({ ...p, commission_value: e.target.value }))} />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Commission mode <FieldHint label="Commission mode" hint="One-time pays once; recurring allows multiple billing-cycle payouts." /></span>
            <KidDropdown
              value={affiliateForm.commission_mode}
              options={[
                { value: "one_time", label: "One-time" },
                { value: "recurring", label: "Recurring" },
              ]}
              onChange={(value) =>
                setAffiliateForm((p) => ({
                  ...p,
                  commission_mode: value,
                  max_commission_cycles: value === "one_time" ? "1" : p.max_commission_cycles,
                }))
              }
              fullWidth
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Commission window (days) <FieldHint label="Commission window (days)" hint="Maximum attribution duration from conversion start." /></span>
            <input type="number" min={1} step={1} value={affiliateForm.commission_window_days} onChange={(e) => setAffiliateForm((p) => ({ ...p, commission_window_days: e.target.value }))} />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Max commission cycles <FieldHint label="Max commission cycles" hint="Upper limit of payable invoice cycles for recurring mode." /></span>
            <input
              type="number"
              min={1}
              step={1}
              disabled={affiliateForm.commission_mode === "one_time"}
              value={affiliateForm.max_commission_cycles}
              onChange={(e) => setAffiliateForm((p) => ({ ...p, max_commission_cycles: e.target.value }))}
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Attribution model <FieldHint label="Attribution model" hint="First-touch gives credit to first affiliate; last-touch to latest." /></span>
            <KidDropdown
              value={affiliateForm.attribution_model}
              options={[
                { value: "first_touch", label: "First touch" },
                { value: "last_touch", label: "Last touch" },
              ]}
              onChange={(value) => setAffiliateForm((p) => ({ ...p, attribution_model: value }))}
              fullWidth
            />
          </label>
          <label className="growth-ops__field">
            <span className="growth-ops__field-label">Payout hold days <FieldHint label="Payout hold days" hint="Delay before commissions become payout-eligible." /></span>
            <input type="number" min={0} step={1} value={affiliateForm.payout_hold_days} onChange={(e) => setAffiliateForm((p) => ({ ...p, payout_hold_days: e.target.value }))} />
          </label>
        </div>
        <div className="growth-ops__row">
          <button type="button" className="growth-ops__btn growth-ops__btn--block" onClick={() => void handleCreateAffiliate()} disabled={!canCreateAffiliate}>
            Create affiliate
          </button>
        </div>
      </section>
      )}

      {activeTab === "promos" && (
      <section className="growth-ops__card">
        <div className="growth-ops__row">
          <h2>Promo codes</h2>
        </div>
        <div className="growth-ops__table-controls">
          <label className="growth-ops__filter">
            <span>Search promos</span>
            <input
              type="text"
              placeholder="Code or name"
              value={promoQuery}
              onChange={(e) => setPromoQuery(e.target.value)}
            />
          </label>
          <label className="growth-ops__filter growth-ops__filter--dropdown">
            <span>Discount type</span>
            <KidDropdown
              value={promoDiscountFilter}
              options={[
                { value: "all", label: "All" },
                { value: "percent", label: "Percent (%)" },
                { value: "fixed", label: "Fixed amount" },
              ]}
              onChange={(value) => setPromoDiscountFilter(value as "all" | "percent" | "fixed")}
              fullWidth
            />
          </label>
        </div>
        <table className="growth-ops__table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Discount</th>
              <th>Expiry</th>
              <th>Limits</th>
            </tr>
          </thead>
          <tbody>
            {filteredPromos.map((promo) => (
              <tr key={promo.id}>
                <td>{promo.code}</td>
                <td>{promo.name}</td>
                <td>{promo.discount_type === "percent" ? `${promo.discount_value}%` : promo.discount_value}</td>
                <td>{promo.ends_at ? new Date(promo.ends_at).toLocaleString() : "-"}</td>
                <td>{promo.per_customer_limit ?? "-"} / {promo.max_redemptions ?? "-"}</td>
              </tr>
            ))}
            {filteredPromos.length === 0 && (
              <tr>
                <td className="growth-ops__empty-cell" colSpan={5}>
                  No promo codes match this search/filter yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      )}

      {activeTab === "affiliates" && (
      <section className="growth-ops__card">
        <h2>Affiliates</h2>
        <div className="growth-ops__table-controls">
          <label className="growth-ops__filter">
            <span>Search affiliates</span>
            <input
              type="text"
              placeholder="Code or name"
              value={affiliateQuery}
              onChange={(e) => setAffiliateQuery(e.target.value)}
            />
          </label>
          <label className="growth-ops__filter growth-ops__filter--dropdown">
            <span>Status</span>
            <KidDropdown
              value={affiliateStatusFilter}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={(value) => setAffiliateStatusFilter(value as "all" | "active" | "paused" | "inactive")}
              fullWidth
            />
          </label>
        </div>
        <table className="growth-ops__table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Commission</th>
              <th>Duration policy</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAffiliates.map((affiliate) => (
              <tr key={affiliate.id}>
                <td>{affiliate.code}</td>
                <td>{affiliate.name}</td>
                <td>{affiliate.commission_type} {affiliate.commission_value}</td>
                <td>{affiliate.commission_mode} / {affiliate.commission_window_days} days / {affiliate.max_commission_cycles} cycles</td>
                <td>{affiliate.status}</td>
              </tr>
            ))}
            {filteredAffiliates.length === 0 && (
              <tr>
                <td className="growth-ops__empty-cell" colSpan={5}>
                  No affiliates match this search/filter yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      )}

      {activeTab === "commissions" && (
      <section className="growth-ops__card">
        <div className="growth-ops__row">
          <div>
            <h2>Commissions</h2>
            <p className="growth-ops__section-note">Track commission status and export payout-ready rows.</p>
          </div>
          <div className="growth-ops__actions">
            <button type="button" className="growth-ops__btn growth-ops__btn--ghost growth-ops__btn--flat-export" onClick={() => void downloadCsvWithAuth(getCommissionFileExportUrl(), "growth-commissions.csv")}>Export CSV</button>
            <button type="button" className="growth-ops__btn growth-ops__btn--ghost growth-ops__btn--flat-export" onClick={() => void downloadCsvWithAuth(getPayoutFileExportUrl(), "growth-payout-file.csv")}>Export payout file</button>
          </div>
        </div>
        <div className="growth-ops__table-wrap">
          <div className="growth-ops__table-controls growth-ops__table-controls--inside">
            <label className="growth-ops__filter">
              <span>Search commissions</span>
              <input
                type="text"
                placeholder="Commission ID or currency"
                value={commissionQuery}
                onChange={(e) => setCommissionQuery(e.target.value)}
              />
            </label>
            <label className="growth-ops__filter growth-ops__filter--dropdown">
              <span>Status</span>
              <KidDropdown
                value={commissionStatusFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "accrued", label: "Accrued" },
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Approved" },
                  { value: "available", label: "Available" },
                  { value: "paid", label: "Paid" },
                  { value: "reversed", label: "Reversed" },
                ]}
                onChange={(value) =>
                  setCommissionStatusFilter(
                    value as "all" | "accrued" | "pending" | "approved" | "available" | "paid" | "reversed",
                  )
                }
                fullWidth
              />
            </label>
          </div>
          <table className="growth-ops__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Available</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredCommissions.map((row) => (
                <tr key={row.id}>
                  <td>{row.id.slice(0, 8)}...</td>
                  <td>{(row.amount_cents / 100).toFixed(2)} {row.currency.toUpperCase()}</td>
                  <td>{formatStatus(row.status)}</td>
                  <td>{row.available_at ? new Date(row.available_at).toLocaleString() : "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="growth-ops__btn growth-ops__btn--mini"
                      onClick={() => void setCommissionPaid(row.id)}
                      disabled={row.status === "paid" || row.status === "reversed"}
                    >
                      Mark paid
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCommissions.length === 0 && (
                <tr>
                  <td className="growth-ops__empty-cell" colSpan={5}>
                    No commissions match this search/filter yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {loading && <p className="growth-ops__loading">Loading growth data...</p>}
    </div>
  );
}
