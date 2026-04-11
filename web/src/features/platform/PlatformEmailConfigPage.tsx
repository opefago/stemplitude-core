import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, HelpCircle, Mail, RefreshCw, X } from "lucide-react";
import {
  getPlatformEmailProviders,
  updatePlatformEmailProvider,
  type PlatformEmailProvider,
} from "../../lib/api/platform";
import { AppTooltip, KidCheckbox } from "../../components/ui";
import "./platform-email-config.css";

function getRouteKeys(provider: PlatformEmailProvider): string[] {
  const routeKeys = provider.config?.["route_keys"];
  return Array.isArray(routeKeys) ? routeKeys.map(String) : [];
}

type RouteRuleOption = { key: string; description: string; aliases?: string[] };

const ROUTE_RULE_OPTIONS: RouteRuleOption[] = [
  { key: "*", description: "All routes (default to all email flows).", aliases: ["all"] },
  { key: "default", description: "Fallback route for all email types." },
  { key: "invite", description: "Invitation emails sent to platform/tenant members." },
  { key: "classroom_enrollment", description: "Student and parent classroom enrollment emails." },
  { key: "classroom_session_content", description: "Classroom content/session update emails." },
  { key: "classroom_submission", description: "Submission notification emails." },
  { key: "classroom_grading", description: "Grading and feedback emails." },
];

function normalizeRouteRule(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function resolveRouteRuleInput(raw: string): string {
  const normalized = normalizeRouteRule(raw);
  if (!normalized) return "";
  const matched = ROUTE_RULE_OPTIONS.find((opt) => {
    if (opt.key === normalized) return true;
    return (opt.aliases ?? []).includes(normalized);
  });
  return matched?.key ?? normalized;
}

function formatRouteRuleLabel(rule: string): string {
  if (rule === "*") return "all";
  return rule;
}

interface RouteRuleEditorProps {
  provider: PlatformEmailProvider;
  disabled: boolean;
  onSave: (providerId: string, routeKeys: string[]) => Promise<void>;
}

function RouteRuleEditor({ provider, disabled, onSave }: RouteRuleEditorProps) {
  const [selectedRules, setSelectedRules] = useState<string[]>(getRouteKeys(provider));
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedRules(getRouteKeys(provider));
  }, [provider.id, provider.config]);

  const allOptions = useMemo(() => {
    const known = new Map(ROUTE_RULE_OPTIONS.map((opt) => [opt.key, opt.description]));
    selectedRules.forEach((rule) => {
      if (!known.has(rule)) known.set(rule, "Custom route rule.");
    });
    return Array.from(known.entries()).map(([key, description]) => ({
      key,
      description,
      aliases: ROUTE_RULE_OPTIONS.find((opt) => opt.key === key)?.aliases,
    }));
  }, [selectedRules]);

  const filteredSuggestions = useMemo(() => {
    const q = normalizeRouteRule(inputValue);
    return allOptions
      .filter((opt) => !selectedRules.includes(opt.key))
      .filter((opt) => {
        if (!q) return true;
        if (opt.key.includes(q)) return true;
        return (opt.aliases ?? []).some((alias) => alias.includes(q));
      })
      .slice(0, 8);
  }, [allOptions, inputValue, selectedRules]);

  const persist = useCallback(
    async (nextRules: string[]) => {
      setSaving(true);
      try {
        await onSave(provider.id, nextRules);
      } finally {
        setSaving(false);
      }
    },
    [onSave, provider.id]
  );

  const addRule = useCallback(
    async (raw: string) => {
      const next = resolveRouteRuleInput(raw);
      if (!next || selectedRules.includes(next)) {
        setInputValue("");
        return;
      }
      const nextRules = next === "*" ? ["*"] : [...selectedRules.filter((r) => r !== "*"), next];
      setSelectedRules(nextRules);
      setInputValue("");
      await persist(nextRules);
    },
    [persist, selectedRules]
  );

  const removeRule = useCallback(
    async (rule: string) => {
      const nextRules = selectedRules.filter((r) => r !== rule);
      setSelectedRules(nextRules);
      await persist(nextRules);
    },
    [persist, selectedRules]
  );

  return (
    <div className="pec-rules">
      <div className="pec-rules__header">
        <span className="pec-rules__title">Route rules</span>
        <AppTooltip
          content={
            <div className="pec-rules__tooltip">
              <strong>Available route rules</strong>
              <ul>
                {ROUTE_RULE_OPTIONS.map((opt) => (
                  <li key={opt.key}>
                    <code>{formatRouteRuleLabel(opt.key)}</code> - {opt.description}
                  </li>
                ))}
              </ul>
            </div>
          }
          placement="top"
        >
          <button type="button" className="pec-help-btn" aria-label="Show route rule help">
            <HelpCircle size={14} />
          </button>
        </AppTooltip>
      </div>

      <div className="pec-rules__pills">
        {selectedRules.map((rule) => (
          <span key={rule} className="pec-pill">
            {formatRouteRuleLabel(rule)}
            <button
              type="button"
              className="pec-pill__remove"
              onClick={() => void removeRule(rule)}
              disabled={disabled || saving}
              aria-label={`Remove ${rule}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {selectedRules.length === 0 && <span className="pec-rules__empty">No rules selected.</span>}
      </div>

      <div className="pec-rules__input-row">
        <input
          className="pec-field"
          type="text"
          value={inputValue}
          disabled={disabled || saving}
          placeholder="Add route rule (e.g. invite)"
          list={`pec-rules-list-${provider.id}`}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addRule(inputValue);
            }
          }}
        />
        <button
          type="button"
          className="ui-btn ui-btn--secondary"
          disabled={disabled || saving || !inputValue.trim()}
          onClick={() => void addRule(inputValue)}
        >
          Add
        </button>
      </div>
      <datalist id={`pec-rules-list-${provider.id}`}>
        {filteredSuggestions.map((opt) => (
          <option key={opt.key} value={formatRouteRuleLabel(opt.key)} />
        ))}
      </datalist>
    </div>
  );
}

export function PlatformEmailConfigPage() {
  const [providers, setProviders] = useState<PlatformEmailProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlatformEmailProviders();
      setProviders(res.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProvider = useCallback(
    async (
      providerId: string,
      payload: { is_active?: boolean; priority?: number; config?: Record<string, unknown> }
    ) => {
      setSavingId(providerId);
      setError(null);
      try {
        await updatePlatformEmailProvider(providerId, payload);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update provider");
      } finally {
        setSavingId(null);
      }
    },
    [load]
  );

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.priority - b.priority),
    [providers]
  );

  const enabledProviders = useMemo(
    () => sortedProviders.filter((p) => p.is_active),
    [sortedProviders]
  );

  const disabledProviders = useMemo(
    () => sortedProviders.filter((p) => !p.is_active),
    [sortedProviders]
  );

  const handleToggleActive = useCallback(
    async (provider: PlatformEmailProvider, nextActive: boolean) => {
      const payload: {
        is_active: boolean;
        priority?: number;
      } = { is_active: nextActive };
      if (nextActive) {
        payload.priority = enabledProviders.length + 1;
      }
      await updateProvider(provider.id, payload);
    },
    [enabledProviders.length, updateProvider]
  );

  const persistEnabledOrder = useCallback(
    async (orderedEnabled: PlatformEmailProvider[]) => {
      setSavingOrder(true);
      setError(null);
      try {
        await Promise.all(
          orderedEnabled.map((provider, index) =>
            updatePlatformEmailProvider(provider.id, { priority: index + 1 })
          )
        );
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save provider order");
      } finally {
        setSavingOrder(false);
      }
    },
    [load]
  );

  const moveProvider = useCallback(
    async (draggedId: string, targetId: string) => {
      if (draggedId === targetId || savingOrder) return;
      const current = [...enabledProviders];
      const fromIndex = current.findIndex((p) => p.id === draggedId);
      const toIndex = current.findIndex((p) => p.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      setProviders((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        const reordered = current.map((p, idx) => ({
          ...(byId.get(p.id) ?? p),
          priority: idx + 1,
        }));
        const rest = prev.filter((p) => !p.is_active);
        return [...reordered, ...rest];
      });
      await persistEnabledOrder(current);
    },
    [enabledProviders, persistEnabledOrder, savingOrder]
  );

  return (
    <div className="pec-page">
      <header className="pec-header">
        <div className="pec-header__left">
          <Mail size={24} className="pec-header__icon" />
          <div>
            <h1 className="pec-header__title">Email Config</h1>
            <p className="pec-header__subtitle">
              Configure provider enablement, priority, and route keys
            </p>
          </div>
        </div>
        <button type="button" className="ui-btn ui-btn--secondary" onClick={() => void load()}>
          <RefreshCw size={15} aria-hidden />
          Refresh
        </button>
      </header>

      {error && <p className="pec-error">{error}</p>}

      <section className="pec-card">
        {loading ? (
          <div className="pec-loading">Loading providers…</div>
        ) : providers.length === 0 ? (
          <div className="pec-loading">No providers found.</div>
        ) : (
          <div className="pec-stack">
            <h2 className="pec-section-title">Enabled Providers (drag to reorder)</h2>
            {savingOrder && <p className="pec-saving-note">Saving new hierarchy…</p>}
            <div className="pec-list">
              {enabledProviders.map((provider, index) => {
                const routeKeys = getRouteKeys(provider);
                const isBusy = savingId === provider.id || savingOrder;
                return (
                  <div
                    key={provider.id}
                    className={`pec-item ${draggingId === provider.id ? "pec-item--dragging" : ""}`}
                    draggable={!isBusy}
                    onDragStart={() => setDraggingId(provider.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragged = draggingId;
                      setDraggingId(null);
                      if (dragged) {
                        void moveProvider(dragged, provider.id);
                      }
                    }}
                  >
                    <div className="pec-item__rank">{index + 1}</div>
                    <div className="pec-item__drag">
                      <GripVertical size={16} aria-hidden />
                    </div>
                    <div className="pec-item__name">{provider.provider}</div>
                    <div className="pec-item__controls">
                      <KidCheckbox
                        checked={provider.is_active}
                        disabled={isBusy}
                        onChange={(checked) => void handleToggleActive(provider, checked)}
                        compact
                        className="pec-kid-checkbox"
                      >
                        Enabled
                      </KidCheckbox>
                      <RouteRuleEditor
                        provider={provider}
                        disabled={isBusy}
                        onSave={async (providerId, keys) => {
                          await updateProvider(providerId, {
                            config: { ...provider.config, route_keys: keys },
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {enabledProviders.length === 0 && (
                <div className="pec-loading">No enabled providers yet.</div>
              )}
            </div>

            <h2 className="pec-section-title">Disabled Providers</h2>
            <div className="pec-list">
              {disabledProviders.map((provider) => (
                <div key={provider.id} className="pec-item pec-item--disabled">
                  <div className="pec-item__rank">-</div>
                  <div className="pec-item__drag" />
                  <div className="pec-item__name">{provider.provider}</div>
                  <div className="pec-item__controls">
                    <KidCheckbox
                      checked={provider.is_active}
                      disabled={savingId === provider.id || savingOrder}
                      onChange={(checked) => void handleToggleActive(provider, checked)}
                      compact
                      className="pec-kid-checkbox"
                    >
                      Enabled
                    </KidCheckbox>
                    <RouteRuleEditor
                      provider={provider}
                      disabled={savingId === provider.id || savingOrder}
                      onSave={async (providerId, keys) => {
                        await updateProvider(providerId, {
                          config: { ...provider.config, route_keys: keys },
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
