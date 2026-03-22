import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  Check,
  Loader2,
  Database,
  AlertCircle,
} from "lucide-react";
import { getEntityDetail } from "../../lib/api/platform";
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

  useEffect(() => {
    if (!entityKey || !entityId) return;
    setLoading(true);
    setError(null);
    getEntityDetail(entityKey, entityId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load entity"))
      .finally(() => setLoading(false));
  }, [entityKey, entityId]);

  const jsonText = data ? JSON.stringify(data, null, 2) : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    navigate(`/app/platform/entities?selected=${encodeURIComponent(entityKey ?? "")}`);
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
