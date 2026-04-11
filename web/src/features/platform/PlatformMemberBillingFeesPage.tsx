import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  getPlatformMemberBillingDefaultFee,
  queryEntity,
  updatePlatformMemberBillingDefaultFee,
} from "../../lib/api/platform";
import { AppTooltip } from "../../components/ui";
import "./platform-member-billing-fees.css";

function bpsToPercentLabel(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

type TenantRow = {
  id: string;
  name?: string;
  slug?: string;
  member_billing_application_fee_bps?: number;
  member_billing_application_fee_use_platform_default?: boolean;
};

export function PlatformMemberBillingFeesPage() {
  const [defaultBps, setDefaultBps] = useState(0);
  const [defaultInput, setDefaultInput] = useState("0");
  const [defaultLoading, setDefaultLoading] = useState(true);
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tenantRows, setTenantRows] = useState<TenantRow[]>([]);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const loadDefault = useCallback(async () => {
    setDefaultLoading(true);
    setDefaultMsg(null);
    try {
      const res = await getPlatformMemberBillingDefaultFee();
      setDefaultBps(res.member_billing_default_application_fee_bps);
      setDefaultInput(String(res.member_billing_default_application_fee_bps));
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Failed to load platform default");
    } finally {
      setDefaultLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDefault();
  }, [loadDefault]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadTenants = useCallback(async () => {
    setTenantsLoading(true);
    setTenantError(null);
    try {
      const res = await queryEntity("tenants", {
        search: debouncedSearch || undefined,
        sort: "name",
        dir: "asc",
        limit: 100,
        offset: 0,
      });
      setTenantRows((res.items ?? []) as TenantRow[]);
      setTenantTotal(res.total ?? 0);
    } catch (e) {
      setTenantError(e instanceof Error ? e.message : "Failed to load tenants");
      setTenantRows([]);
      setTenantTotal(0);
    } finally {
      setTenantsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const saveDefault = async () => {
    const n = Number.parseInt(defaultInput, 10);
    if (Number.isNaN(n) || n < 0 || n > 10000) {
      setDefaultMsg("Use 0–10000 basis points (100 = 1%).");
      return;
    }
    setDefaultSaving(true);
    setDefaultMsg(null);
    try {
      const res = await updatePlatformMemberBillingDefaultFee(n);
      setDefaultBps(res.member_billing_default_application_fee_bps);
      setDefaultInput(String(res.member_billing_default_application_fee_bps));
      setDefaultMsg("Saved platform default.");
      void loadTenants();
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDefaultSaving(false);
    }
  };

  const rowsWithEffective = useMemo(() => {
    return tenantRows.map((row) => {
      const usePlat = Boolean(row.member_billing_application_fee_use_platform_default);
      const custom = Number(row.member_billing_application_fee_bps ?? 0);
      const effective = usePlat ? defaultBps : custom;
      return { row, usePlat, custom, effective };
    });
  }, [tenantRows, defaultBps]);

  return (
    <div className="mbf-page" role="main" aria-label="Stripe member billing fees">
      <header className="mbf-header">
        <div className="mbf-header__left">
          <div className="mbf-header__icon" aria-hidden>
            <CreditCard size={22} />
          </div>
          <div>
            <h1 className="mbf-header__title">Stripe member billing fees</h1>
            <p className="mbf-header__subtitle">
              Platform application fee on Connect checkouts (family / membership). Set a default for all
              organizations that follow the platform rate, or override per tenant.
            </p>
          </div>
        </div>
      </header>

      <section className="mbf-card mbf-stack">
        <h2 className="mbf-section-title">Platform default</h2>
        <p className="mbf-help">
          Organizations with &quot;Use platform default&quot; use this rate. Others use their custom basis
          points. 100 bps = 1%.
        </p>
        {defaultLoading ? (
          <div className="mbf-muted">
            <Loader2 size={20} className="mbf-spin" aria-hidden /> Loading…
          </div>
        ) : (
          <div className="mbf-row">
            <label className="mbf-field">
              <span className="mbf-field__label">Basis points</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={defaultInput}
                onChange={(e) => setDefaultInput(e.target.value)}
                disabled={defaultSaving}
                className="mbf-input"
              />
            </label>
            <div className="mbf-field mbf-field--readonly">
              <span className="mbf-field__label">Preview</span>
              <span className="mbf-preview">{bpsToPercentLabel(Number.parseInt(defaultInput, 10) || 0)}</span>
            </div>
            <button
              type="button"
              className="mbf-btn mbf-btn--primary"
              onClick={() => void saveDefault()}
              disabled={defaultSaving}
            >
              {defaultSaving ? "Saving…" : "Save default"}
            </button>
            <button
              type="button"
              className="mbf-btn mbf-btn--ghost"
              onClick={() => void loadDefault()}
              disabled={defaultLoading || defaultSaving}
              aria-label="Reload platform default"
            >
              <RefreshCw size={18} aria-hidden />
            </button>
          </div>
        )}
        {defaultMsg ? <p className="mbf-msg">{defaultMsg}</p> : null}
      </section>

      <section className="mbf-card mbf-stack">
        <div className="mbf-section-head">
          <h2 className="mbf-section-title">Per organization</h2>
          <AppTooltip description="Edit fee and “use platform default” on the tenant detail page, or open the full record here.">
            <span className="mbf-hint">Tip</span>
          </AppTooltip>
        </div>
        <input
          type="search"
          className="mbf-search"
          placeholder="Search by name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search tenants"
        />
        {tenantError ? <p className="mbf-error">{tenantError}</p> : null}
        {tenantsLoading ? (
          <div className="mbf-muted">
            <Loader2 size={20} className="mbf-spin" aria-hidden /> Loading tenants…
          </div>
        ) : (
          <>
            <p className="mbf-count">
              Showing {tenantRows.length} of {tenantTotal} organizations
            </p>
            <div className="mbf-table-wrap">
              <table className="mbf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Uses platform default</th>
                    <th>Custom bps</th>
                    <th>Effective</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rowsWithEffective.map(({ row, usePlat, custom, effective }) => (
                    <tr key={row.id}>
                      <td className="mbf-td-name">{row.name ?? "—"}</td>
                      <td>
                        <code className="mbf-code">{row.slug ?? "—"}</code>
                      </td>
                      <td>{usePlat ? "Yes" : "No"}</td>
                      <td>{custom}</td>
                      <td>
                        <strong>{effective}</strong>{" "}
                        <span className="mbf-muted-inline">({bpsToPercentLabel(effective)})</span>
                      </td>
                      <td className="mbf-td-actions">
                        <Link
                          to={`/app/platform/entities/tenants/${row.id}`}
                          className="mbf-link"
                          title="Open tenant in entity browser"
                        >
                          <ExternalLink size={16} aria-hidden />
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
