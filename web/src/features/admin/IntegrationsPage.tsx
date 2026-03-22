import { useEffect, useMemo, useState } from "react";
import {
  Settings,
  Link2,
  Unlink,
  Check,
  X,
  Key,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { disconnectConnection, getConnectUrl, listOAuthConnections } from "../../lib/api/integrations";
import { KidDropdown } from "../../components/ui";
import "../../components/ui/ui.css";
import "./integrations.css";

type IntegrationStatus = "connected" | "disconnected";

interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  letter: string;
  color: string;
}

const INTEGRATIONS: IntegrationDefinition[] = [
  { id: "google", name: "Google", description: "Connect Google Calendar and related services", letter: "G", color: "#4285f4" },
  { id: "microsoft", name: "Microsoft", description: "Connect Microsoft calendar and productivity tools", letter: "M", color: "#6264a7" },
  { id: "zoom", name: "Zoom", description: "Launch virtual classes directly from your dashboard", letter: "Z", color: "#2d8cff" },
];

export function IntegrationsPage() {
  const [connections, setConnections] = useState<
    { id: string; provider: string; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, { apiKey: string; webhookUrl: string; syncFrequency: string }>>({});

  const loadConnections = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listOAuthConnections();
        setConnections(rows.map((r) => ({ id: r.id, provider: r.provider, created_at: r.created_at })));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load integrations");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const openConfig = (id: string, provider: string) => {
    setConfiguringId(id);
    if (!configForm[id]) {
      setConfigForm((prev) => ({
        ...prev,
        [id]: {
          apiKey: "",
          webhookUrl: "",
          syncFrequency: provider === "zoom" ? "realtime" : "hourly",
        },
      }));
    }
  };

  const connectProvider = async (provider: string) => {
    try {
      const res = await getConnectUrl(provider);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start OAuth flow");
    }
  };

  const closeConfig = () => setConfiguringId(null);

  const handleSaveConfig = (id: string) => {
    setConfigForm((prev) => ({
      ...prev,
      [id]: prev[id] ?? { apiKey: "", webhookUrl: "", syncFrequency: "hourly" },
    }));
    closeConfig();
  };

  const handleRemoveConfig = async (id: string) => {
    try {
      await disconnectConnection(id);
      setConfiguringId(null);
      await loadConnections();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to disconnect integration");
    }
  };

  return (
    <div className="integrations-page" role="main" aria-label="Integrations">
      <header className="integrations-page__header">
        <h1 className="integrations-page__title">Integrations</h1>
        <p className="integrations-page__subtitle">Connect your favorite tools</p>
        {error && <p className="integrations-page__subtitle" style={{ color: "var(--color-error, #ef4444)" }}>{error}</p>}
      </header>

      <div className="integrations-page__grid">
        {INTEGRATIONS.map((int) => {
          const activeConnection = connections.find((c) => c.provider === int.id);
          const status: IntegrationStatus = activeConnection ? "connected" : "disconnected";
          return (
          <div
            key={int.id}
            className={`integrations-page__card ${status === "connected" ? "integrations-page__card--connected" : ""}`}
          >
            <div className="integrations-page__card-header">
              <div
                className="integrations-page__icon"
                style={{ backgroundColor: int.color }}
                aria-hidden
              >
                {int.letter}
              </div>
              <div className="integrations-page__card-meta">
                <h3 className="integrations-page__card-title">{int.name}</h3>
                <span
                  className={`integrations-page__status integrations-page__status--${status}`}
                >
                  {status === "connected" ? (
                    <>
                      <Check size={14} aria-hidden /> Connected
                    </>
                  ) : (
                    <>Not Connected</>
                  )}
                </span>
              </div>
            </div>
            <p className="integrations-page__description">{int.description}</p>
            <div className="integrations-page__actions">
              {status === "connected" ? (
                <>
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--secondary"
                    onClick={() => openConfig(activeConnection!.id, int.id)}
                  >
                    <Settings size={16} aria-hidden /> Configure
                  </button>
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--ghost"
                    onClick={() => handleRemoveConfig(activeConnection!.id)}
                  >
                    <Unlink size={16} aria-hidden /> Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="integrations-page__btn integrations-page__btn--primary"
                  onClick={() => connectProvider(int.id)}
                  disabled={loading}
                >
                  <Link2 size={16} aria-hidden /> Connect
                </button>
              )}
            </div>

            {activeConnection && configuringId === activeConnection.id && (
              <div className="integrations-page__config-panel">
                <h4 className="integrations-page__config-title">Configuration</h4>
                <div className="integrations-page__config-fields">
                  <div className="integrations-page__field">
                    <label htmlFor={`api-key-${int.id}`}>
                      <Key size={14} aria-hidden /> API Key
                    </label>
                    <input
                      id={`api-key-${int.id}`}
                      type="password"
                      value={configForm[activeConnection.id]?.apiKey ?? ""}
                      onChange={(e) =>
                        setConfigForm((prev) => ({
                          ...prev,
                          [activeConnection.id]: {
                            ...(prev[activeConnection.id] ?? {}),
                            apiKey: e.target.value,
                            webhookUrl: prev[activeConnection.id]?.webhookUrl ?? "",
                            syncFrequency: prev[activeConnection.id]?.syncFrequency ?? "hourly",
                          },
                        }))
                      }
                      placeholder="••••••••••••••••"
                    />
                  </div>
                  <div className="integrations-page__field">
                    <label htmlFor={`webhook-${int.id}`}>Webhook URL</label>
                    <input
                      id={`webhook-${int.id}`}
                      type="url"
                      value={configForm[activeConnection.id]?.webhookUrl ?? ""}
                      onChange={(e) =>
                        setConfigForm((prev) => ({
                          ...prev,
                          [activeConnection.id]: {
                            ...(prev[activeConnection.id] ?? {}),
                            apiKey: prev[activeConnection.id]?.apiKey ?? "",
                            webhookUrl: e.target.value,
                            syncFrequency: prev[activeConnection.id]?.syncFrequency ?? "hourly",
                          },
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div className="integrations-page__field">
                    <label htmlFor={`sync-${int.id}`}>Sync frequency</label>
                    <KidDropdown
                      value={configForm[activeConnection.id]?.syncFrequency ?? "hourly"}
                      fullWidth
                      ariaLabel="Sync frequency"
                      onChange={(v) =>
                        setConfigForm((prev) => ({
                          ...prev,
                          [activeConnection.id]: {
                            ...(prev[activeConnection.id] ?? {}),
                            apiKey: prev[activeConnection.id]?.apiKey ?? "",
                            webhookUrl: prev[activeConnection.id]?.webhookUrl ?? "",
                            syncFrequency: v,
                          },
                        }))
                      }
                      options={[
                        { value: "realtime", label: "Realtime" },
                        { value: "hourly", label: "Hourly" },
                        { value: "daily", label: "Daily" },
                        { value: "weekly", label: "Weekly" },
                      ]}
                    />
                  </div>
                  {activeConnection.created_at && (
                    <p className="integrations-page__last-synced">
                      Connected: {new Date(activeConnection.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="integrations-page__config-actions">
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--secondary"
                  >
                    <RefreshCw size={16} aria-hidden /> Test Connection
                  </button>
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--primary"
                    onClick={() => handleSaveConfig(int.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--danger"
                    onClick={() => handleRemoveConfig(activeConnection.id)}
                  >
                    <Trash2 size={16} aria-hidden /> Remove
                  </button>
                  <button
                    type="button"
                    className="integrations-page__btn integrations-page__btn--ghost"
                    onClick={closeConfig}
                  >
                    <X size={16} aria-hidden /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
