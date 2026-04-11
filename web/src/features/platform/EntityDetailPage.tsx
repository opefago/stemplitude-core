import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  Check,
  Loader2,
  Database,
  AlertCircle,
} from "lucide-react";
import { getEntityDetail, updateTenantMemberBillingFee } from "../../lib/api/platform";
import { KidCheckbox } from "../../components/ui";
import "./entity-browser.css";

/* -------------------------------------------------------------------------- */
/* JSON syntax highlighting                                                   */
/* -------------------------------------------------------------------------- */

function highlightJson(json: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /("(?:[^"\\]|\\.)*"|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(json)) !== null) {
    parts.push(
      <span key={`t-${lastIndex}`} className="eb-json-text">
        {json.slice(lastIndex, match.index)}
      </span>
    );
    const val = match[0];
    const cls =
      val.startsWith('"') ? "eb-json-string" :
      /^(true|false|null)$/.test(val) ? "eb-json-keyword" :
      /^-?\d/.test(val) ? "eb-json-number" : "eb-json-text";
    parts.push(
      <span key={`m-${match.index}`} className={cls}>
        {val}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  parts.push(
    <span key="tail" className="eb-json-text">
      {json.slice(lastIndex)}
    </span>
  );
  return parts;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function EntityDetailPage() {
  const { entityKey, entityId } = useParams<{ entityKey: string; entityId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [feeUsePlatformDefault, setFeeUsePlatformDefault] = useState(false);
  const [feeMsg, setFeeMsg] = useState<string | null>(null);
  const [feeBusy, setFeeBusy] = useState(false);

  const loadDetail = useCallback(() => {
    if (!entityKey || !entityId) return Promise.resolve();
    setLoading(true);
    setError(null);
    return getEntityDetail(entityKey, entityId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load entity"))
      .finally(() => setLoading(false));
  }, [entityKey, entityId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!data) return;
    if (typeof data.member_billing_application_fee_bps === "number") {
      setFeeInput(String(data.member_billing_application_fee_bps));
    }
    setFeeUsePlatformDefault(Boolean(data.member_billing_application_fee_use_platform_default));
  }, [data]);

  const jsonText = data ? JSON.stringify(data, null, 2) : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    navigate(`/app/platform/entities?selected=${encodeURIComponent(entityKey ?? "")}`);
  };

  const saveMemberBillingFee = async () => {
    if (!entityId || entityKey !== "tenants") return;
    const n = Number.parseInt(feeInput, 10);
    if (!feeUsePlatformDefault && (Number.isNaN(n) || n < 0 || n > 10000)) {
      setFeeMsg("Use 0–10000 basis points (100 = 1%).");
      return;
    }
    setFeeBusy(true);
    setFeeMsg(null);
    try {
      await updateTenantMemberBillingFee(entityId, {
        member_billing_application_fee_use_platform_default: feeUsePlatformDefault,
        ...(!feeUsePlatformDefault ? { member_billing_application_fee_bps: n } : {}),
      });
      const res = await getEntityDetail(entityKey, entityId);
      setData(res.data);
      setFeeMsg("Saved.");
    } catch (err) {
      setFeeMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setFeeBusy(false);
    }
  };

  return (
    <div className="eb" role="main" aria-label="Entity Detail">
      <div className="eb__detail-header">
        <button type="button" className="eb__back-btn" onClick={handleBack}>
          <ChevronLeft size={20} aria-hidden />
          Back to {entityKey ?? "entities"}
        </button>
        <h2 className="eb__detail-title">
          <Database size={20} aria-hidden className="eb__detail-title-icon" />
          {entityKey}
          <span className="eb__detail-count">{entityId ? `${entityId.slice(0, 8)}…` : ""}</span>
        </h2>
      </div>

      {loading ? (
        <div className="eb__loading">
          <Loader2 size={32} className="eb__spinner" />
          Loading entity...
        </div>
      ) : error ? (
        <div className="eb__error-card">
          <AlertCircle size={24} />
          <div>
            <h3>Failed to load entity</h3>
            <p>{error}</p>
          </div>
        </div>
      ) : data ? (
        <div className="eb__detail-content">
          {entityKey === "tenants" && entityId ? (
            <div className="eb__kv-section" style={{ marginBottom: "var(--spacing-md)" }}>
              <h3 className="eb__kv-title">Member billing — platform fee (Stripe Connect)</h3>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.9rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                Basis points retained by the platform on this organization&apos;s family checkouts and
                subscriptions. 100 bps = 1%. Use the platform default from Platform → Member billing fees, or
                set a custom rate below.
              </p>
              <div style={{ marginBottom: "0.75rem" }}>
                <KidCheckbox
                  checked={feeUsePlatformDefault}
                  onChange={setFeeUsePlatformDefault}
                  disabled={feeBusy}
                >
                  Use platform default fee
                </KidCheckbox>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "flex-end",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Custom basis points</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                    disabled={feeBusy || feeUsePlatformDefault}
                    className="eb__filter-input eb__filter-input--sm"
                  />
                </label>
                <button
                  type="button"
                  className="eb__back-btn"
                  onClick={() => void saveMemberBillingFee()}
                  disabled={feeBusy}
                >
                  {feeBusy ? "Saving…" : "Save fee"}
                </button>
              </div>
              {feeMsg ? (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>{feeMsg}</p>
              ) : null}
            </div>
          ) : null}
          {/* Key-value table */}
          <div className="eb__kv-section">
            <div className="eb__kv-header">
              <h3 className="eb__kv-title">Properties</h3>
              <button type="button" className="eb__copy-json-btn" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
            <table className="eb__kv-table">
              <tbody>
                {Object.entries(data).map(([key, val]) => (
                  <tr key={key} className="eb__kv-row">
                    <td className="eb__kv-key">{key}</td>
                    <td className="eb__kv-val">
                      {val === null ? (
                        <span className="eb__null">null</span>
                      ) : typeof val === "boolean" ? (
                        <span className={`eb__badge eb__badge--${val ? "active" : "inactive"}`}>
                          {val ? "true" : "false"}
                        </span>
                      ) : typeof val === "object" ? (
                        <pre className="eb__kv-json">{JSON.stringify(val, null, 2)}</pre>
                      ) : (
                        <span className="eb__kv-text">{String(val)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Raw JSON */}
          <div className="eb__raw-json-section">
            <h3 className="eb__kv-title">Raw JSON</h3>
            <pre className="eb__json-view">{highlightJson(jsonText)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
