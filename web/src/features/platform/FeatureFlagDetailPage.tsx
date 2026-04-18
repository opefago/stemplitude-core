import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Sparkles, Target, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createPlatformFeatureFlagRule,
  createPlatformFeatureFlagTarget,
  getPlatformFeatureFlag,
  listPlatformFeatureFlagMetrics,
  listPlatformFeatureFlagRules,
  listPlatformFeatureFlagTargets,
  patchPlatformFeatureFlag,
  patchPlatformFeatureFlagRule,
  patchPlatformFeatureFlagTarget,
  searchPlatformFeatureFlagTenants,
  searchPlatformFeatureFlagUsers,
  type PlatformFeatureFlag,
  type PlatformFeatureFlagMetricPoint,
  type PlatformFeatureFlagRule,
  type PlatformFeatureFlagTarget,
} from "../../lib/api/platform";
import { AccordionCard, KidCheckbox, KidDialog, KidDropdown, KidSwitch } from "../../components/ui";
import "./feature-flags-page.css";

function Sparkline({ points }: { points: PlatformFeatureFlagMetricPoint[] }) {
  const values = points.map((point) => point.on_count + point.off_count);
  const max = Math.max(1, ...values);
  const width = 240;
  const height = 60;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const coordinates = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  if (values.length === 0) {
    return <div className="feature-flags-page__sparkline-empty">No usage yet</div>;
  }
  return (
    <svg
      className="feature-flags-page__sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Flag traffic over time"
    >
      <polyline fill="none" strokeWidth="3" points={coordinates} />
    </svg>
  );
}

function initialsFromLabel(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function FeatureFlagDetailPage() {
  const navigate = useNavigate();
  const { flagId = "" } = useParams();
  const [isLoadingFlag, setIsLoadingFlag] = useState(true);
  const [isFlagMissing, setIsFlagMissing] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"targets" | "rules" | "none">("targets");
  const [selectedFlag, setSelectedFlag] = useState<PlatformFeatureFlag | null>(null);
  const [draftDefaultEnabled, setDraftDefaultEnabled] = useState(false);
  const [rules, setRules] = useState<PlatformFeatureFlagRule[]>([]);
  const [targets, setTargets] = useState<PlatformFeatureFlagTarget[]>([]);
  const [metrics, setMetrics] = useState<PlatformFeatureFlagMetricPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [targetLookupQuery, setTargetLookupQuery] = useState("");
  const [targetLookupLoading, setTargetLookupLoading] = useState(false);
  const [editingTarget, setEditingTarget] = useState<PlatformFeatureFlagTarget | null>(null);
  const [editingRule, setEditingRule] = useState<PlatformFeatureFlagRule | null>(null);
  const [editTargetForm, setEditTargetForm] = useState({
    target_type: "tenant",
    target_key: "",
    stage: "any",
    enabled: true,
    variant: "",
  });
  const [editRuleForm, setEditRuleForm] = useState({
    priority: 100,
    match_operator: "all",
    rollout_percentage: 100,
    attribute: "region",
    op: "eq",
    value: "",
    variant: "",
    enabled: true,
  });
  const [userLookupOptions, setUserLookupOptions] = useState<
    Array<{ value: string; label: string; subtitle?: string; meta?: string; avatarUrl?: string | null }>
  >([]);
  const [tenantLookupOptions, setTenantLookupOptions] = useState<
    Array<{ value: string; label: string; subtitle?: string; meta?: string; avatarUrl?: string | null }>
  >([]);
  const [targetForm, setTargetForm] = useState({
    target_type: "tenant",
    target_key: "",
    stage: "any",
    enabled: true,
    variant: "",
  });
  const [ruleForm, setRuleForm] = useState({
    priority: 100,
    match_operator: "all",
    use_specific_targeting: false,
    attribute: "region",
    op: "eq",
    value: "",
    rollout_percentage: 100,
    variant: "",
  });

  useEffect(() => {
    async function load() {
      if (!flagId) return;
      setIsLoadingFlag(true);
      setIsFlagMissing(false);
      setSelectedFlag(null);
      try {
        const flag = await getPlatformFeatureFlag(flagId);
        setSelectedFlag(flag);
        setDraftDefaultEnabled(Boolean(flag.default_enabled));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load feature flags";
        if (message.toLowerCase().includes("not found")) {
          setIsFlagMissing(true);
        } else {
          setError(message);
        }
      } finally {
        setIsLoadingFlag(false);
      }
    }
    void load();
  }, [flagId]);

  useEffect(() => {
    if (!flagId) return;
    async function loadDetails() {
      try {
        const [ruleRows, targetRows, metricRows] = await Promise.all([
          listPlatformFeatureFlagRules(flagId),
          listPlatformFeatureFlagTargets(flagId),
          listPlatformFeatureFlagMetrics(flagId, { days: 14, granularity: "day" }),
        ]);
        setRules(ruleRows);
        setTargets(targetRows);
        setMetrics(metricRows.points);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load flag details");
      }
    }
    void loadDetails();
  }, [flagId]);

  useEffect(() => {
    if (targetForm.target_type === "all") {
      setTargetForm((prev) => ({ ...prev, target_key: "*" }));
      return;
    }
    if (targetForm.target_key === "*") {
      setTargetForm((prev) => ({ ...prev, target_key: "" }));
    }
  }, [targetForm.target_type]);

  useEffect(() => {
    if (targetForm.target_type === "all") return;
    const query = targetLookupQuery.trim();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setTargetLookupLoading(true);
        if (targetForm.target_type === "user") {
          const response = await searchPlatformFeatureFlagUsers(query, 12);
          if (cancelled) return;
          setUserLookupOptions(
            response.items.map((item) => ({
              value: item.id,
              label: item.full_name || item.email,
              subtitle: item.email,
              meta: item.id,
              avatarUrl: item.avatar_url,
            }))
          );
        } else if (targetForm.target_type === "tenant") {
          const response = await searchPlatformFeatureFlagTenants(query, 12);
          if (cancelled) return;
          setTenantLookupOptions(
            response.items.map((item) => ({
              value: item.id,
              label: item.name,
              subtitle: item.slug,
              meta: `${item.type} · ${item.is_active ? "active" : "inactive"} · ${item.id}`,
              avatarUrl: item.avatar_url,
            }))
          );
        }
      } finally {
        if (!cancelled) setTargetLookupLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetForm.target_type, targetLookupQuery]);

  const isFlagDirty = Boolean(selectedFlag) && draftDefaultEnabled !== Boolean(selectedFlag?.default_enabled);
  const isTargetDirty =
    targetForm.target_type !== "tenant" ||
    targetForm.target_key.trim().length > 0 ||
    targetForm.stage !== "any" ||
    targetForm.enabled !== true ||
    targetForm.variant.trim().length > 0;
  const isRuleDirty =
    ruleForm.priority !== 100 ||
    ruleForm.match_operator !== "all" ||
    ruleForm.use_specific_targeting ||
    ruleForm.attribute !== "region" ||
    ruleForm.op !== "eq" ||
    ruleForm.value.trim().length > 0 ||
    ruleForm.rollout_percentage !== 100 ||
    ruleForm.variant.trim().length > 0;
  const isEditTargetDirty =
    Boolean(editingTarget) &&
    (editTargetForm.target_type !== editingTarget?.target_type ||
      editTargetForm.target_key.trim() !== editingTarget?.target_key ||
      editTargetForm.stage !== editingTarget?.stage ||
      editTargetForm.enabled !== editingTarget?.enabled ||
      (editTargetForm.variant.trim() || null) !== editingTarget?.variant);
  const isEditRuleDirty =
    Boolean(editingRule) &&
    (editRuleForm.priority !== editingRule?.priority ||
      editRuleForm.match_operator !== editingRule?.match_operator ||
      Number(editRuleForm.rollout_percentage) !== Number(editingRule?.rollout_percentage ?? 100) ||
      (editRuleForm.variant.trim() || null) !== editingRule?.variant ||
      editRuleForm.enabled !== editingRule?.enabled ||
      JSON.stringify(
        editRuleForm.value.trim()
          ? [{ attribute: editRuleForm.attribute.trim(), op: editRuleForm.op, value: editRuleForm.value.trim() }]
          : []
      ) !== JSON.stringify(editingRule?.conditions ?? []));

  const onSaveFlag = async () => {
    if (!selectedFlag) return;
    setError(null);
    setMessage(null);
    try {
      await patchPlatformFeatureFlag(selectedFlag.id, {
        default_enabled: draftDefaultEnabled,
      });
      const updatedFlag = await getPlatformFeatureFlag(selectedFlag.id);
      setSelectedFlag(updatedFlag);
      setDraftDefaultEnabled(Boolean(updatedFlag.default_enabled));
      setMessage("Default state updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flag");
    }
  };

  const onAddTarget = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFlag) return;
    setError(null);
    setMessage(null);
    try {
      await createPlatformFeatureFlagTarget(selectedFlag.id, {
        target_type: targetForm.target_type as "all" | "user" | "tenant",
        target_key: targetForm.target_key.trim(),
        stage: targetForm.stage as "any" | "dev" | "production",
        enabled: targetForm.enabled,
        variant: targetForm.variant.trim() || null,
      });
      setTargetForm({
        target_type: "tenant",
        target_key: "",
        stage: "any",
        enabled: true,
        variant: "",
      });
      const rows = await listPlatformFeatureFlagTargets(selectedFlag.id);
      setTargets(rows);
      setMessage("Target added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add target");
    }
  };

  const onAddRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFlag) return;
    setError(null);
    setMessage(null);
    try {
      await createPlatformFeatureFlagRule(selectedFlag.id, {
        priority: Number(ruleForm.priority),
        enabled: true,
        rule_type: "experiment",
        match_operator: ruleForm.match_operator as "all" | "any",
        conditions: ruleForm.use_specific_targeting && ruleForm.value.trim()
          ? [
              {
                attribute: ruleForm.attribute.trim(),
                op: ruleForm.op,
                value: ruleForm.value.trim(),
              },
            ]
          : [],
        rollout_percentage: Number(ruleForm.rollout_percentage),
        variant: ruleForm.variant.trim() || null,
      });
      setRuleForm({
        priority: 100,
        match_operator: "all",
        use_specific_targeting: false,
        attribute: "region",
        op: "eq",
        value: "",
        rollout_percentage: 100,
        variant: "",
      });
      const rows = await listPlatformFeatureFlagRules(selectedFlag.id);
      setRules(rows);
      setMessage("Rule added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add rule");
    }
  };

  const startEditTarget = (target: PlatformFeatureFlagTarget) => {
    setEditingTarget(target);
    setEditTargetForm({
      target_type: target.target_type,
      target_key: target.target_key,
      stage: target.stage,
      enabled: target.enabled,
      variant: target.variant ?? "",
    });
  };

  const startEditRule = (rule: PlatformFeatureFlagRule) => {
    setEditingRule(rule);
    const firstCondition = rule.conditions[0] as { attribute?: string; op?: string; value?: unknown } | undefined;
    setEditRuleForm({
      priority: rule.priority,
      match_operator: rule.match_operator,
      rollout_percentage: rule.rollout_percentage ?? 100,
      attribute: String(firstCondition?.attribute ?? "region"),
      op: String(firstCondition?.op ?? "eq"),
      value: firstCondition?.value != null ? String(firstCondition.value) : "",
      variant: rule.variant ?? "",
      enabled: rule.enabled,
    });
  };

  const onSaveEditedTarget = async () => {
    if (!editingTarget || !selectedFlag) return;
    setError(null);
    setMessage(null);
    try {
      await patchPlatformFeatureFlagTarget(editingTarget.id, {
        target_type: editTargetForm.target_type as "all" | "user" | "tenant",
        target_key: editTargetForm.target_key.trim(),
        stage: editTargetForm.stage as "any" | "dev" | "production",
        enabled: editTargetForm.enabled,
        variant: editTargetForm.variant.trim() || null,
      });
      setEditingTarget(null);
      const rows = await listPlatformFeatureFlagTargets(selectedFlag.id);
      setTargets(rows);
      setMessage("Target updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update target");
    }
  };

  const onSaveEditedRule = async () => {
    if (!editingRule || !selectedFlag) return;
    setError(null);
    setMessage(null);
    try {
      await patchPlatformFeatureFlagRule(editingRule.id, {
        priority: Number(editRuleForm.priority),
        enabled: editRuleForm.enabled,
        match_operator: editRuleForm.match_operator as "all" | "any",
        conditions: editRuleForm.value.trim()
          ? [{ attribute: editRuleForm.attribute.trim(), op: editRuleForm.op, value: editRuleForm.value.trim() }]
          : [],
        rollout_percentage: Number(editRuleForm.rollout_percentage),
        variant: editRuleForm.variant.trim() || null,
      });
      setEditingRule(null);
      const rows = await listPlatformFeatureFlagRules(selectedFlag.id);
      setRules(rows);
      setMessage("Rule updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  if (isLoadingFlag) {
    return (
      <div className="feature-flags-page">
        <button type="button" className="kid-button kid-button--ghost" onClick={() => navigate("/app/platform/feature-flags")}>
          <ArrowLeft size={16} />
          Back to flags
        </button>
        <div className="feature-flags-page__notice">Loading feature flag...</div>
      </div>
    );
  }

  if (isFlagMissing || !selectedFlag) {
    return (
      <div className="feature-flags-page">
        <button type="button" className="kid-button kid-button--ghost" onClick={() => navigate("/app/platform/feature-flags")}>
          <ArrowLeft size={16} />
          Back to flags
        </button>
        <div className="feature-flags-page__error">Feature flag not found.</div>
      </div>
    );
  }

  return (
    <div className="feature-flags-page">
      <button type="button" className="kid-button kid-button--ghost" onClick={() => navigate("/app/platform/feature-flags")}>
        <ArrowLeft size={16} />
        Back to flags
      </button>
      {error && <div className="feature-flags-page__error">{error}</div>}
      {message && <div className="feature-flags-page__notice">{message}</div>}

      <section className="feature-flags-page__detail-grid">
        <article className="feature-flags-page__panel">
          <div className="feature-flags-page__panel-heading">
            <h2 className="feature-flags-page__flag-title">{selectedFlag.key}</h2>
            <div className="feature-flags-page__inline-actions">
              <KidSwitch
                checked={draftDefaultEnabled}
                onChange={setDraftDefaultEnabled}
                ariaLabel="Toggle default flag state"
                size="sm"
              />
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={onSaveFlag}
                disabled={!isFlagDirty}
              >
                Save
              </button>
            </div>
          </div>
          <p>{selectedFlag.description || "No description."}</p>
          <Sparkline points={metrics} />
          <div className="feature-flags-page__kpi-row">
            <div>
              <span>On checks</span>
              <strong>{metrics.reduce((sum, row) => sum + row.on_count, 0)}</strong>
            </div>
            <div>
              <span>Off checks</span>
              <strong>{metrics.reduce((sum, row) => sum + row.off_count, 0)}</strong>
            </div>
            <div>
              <span>Usage</span>
              <strong>{metrics.reduce((sum, row) => sum + row.usage_count, 0)}</strong>
            </div>
          </div>
        </article>

        <article className="feature-flags-page__panel">
          <AccordionCard
            expanded={expandedPanel === "targets"}
            onToggle={() => setExpandedPanel((prev) => (prev === "targets" ? "none" : "targets"))}
            summary={
              <div>
                <h3 className="feature-flags-page__accordion-title">
                  <Target size={18} />
                  Add target
                </h3>
                <p className="feature-flags-page__accordion-subtitle">
                  Target specific users, tenants, or all traffic.
                </p>
              </div>
            }
          >
            <form onSubmit={onAddTarget} className="feature-flags-page__form">
              <label>
                Target type
                <KidDropdown
                  value={targetForm.target_type}
                  onChange={(value) => {
                    setTargetLookupQuery("");
                    setTargetForm((prev) => ({ ...prev, target_type: value, target_key: value === "all" ? "*" : "" }));
                    setUserLookupOptions([]);
                    setTenantLookupOptions([]);
                  }}
                  options={[
                    { value: "tenant", label: "tenant" },
                    { value: "user", label: "user" },
                    { value: "all", label: "all" },
                  ]}
                  fullWidth
                />
              </label>
              <label>
                Target key
                {targetForm.target_type === "all" ? (
                  <input value="*" disabled />
                ) : (
                  <div className="feature-flags-page__typeahead">
                    <input
                      value={targetLookupQuery}
                      onChange={(event) => {
                        setTargetLookupQuery(event.target.value);
                        setTargetForm((prev) => ({ ...prev, target_key: "" }));
                      }}
                      placeholder={
                        targetForm.target_type === "user"
                          ? "Type to search user by id, email, name, username"
                          : "Type to search tenant by id, name, slug"
                      }
                    />
                    {targetLookupQuery.trim() ? (
                      <div className="feature-flags-page__typeahead-list">
                        {targetLookupLoading ? (
                          <div className="feature-flags-page__typeahead-empty">Searching...</div>
                        ) : (targetForm.target_type === "user" ? userLookupOptions : tenantLookupOptions)
                            .length ? (
                          (targetForm.target_type === "user" ? userLookupOptions : tenantLookupOptions).map(
                            (option) => (
                              <button
                                key={option.value}
                                type="button"
                                className="feature-flags-page__typeahead-item"
                                onClick={() => {
                                  setTargetForm((prev) => ({ ...prev, target_key: option.value }));
                                  setTargetLookupQuery(
                                    option.subtitle ? `${option.label} (${option.subtitle})` : option.label
                                  );
                                }}
                              >
                                {option.avatarUrl ? (
                                  <img className="feature-flags-page__typeahead-avatar" src={option.avatarUrl} alt="" />
                                ) : (
                                  <span className="feature-flags-page__typeahead-avatar-fallback">
                                    {initialsFromLabel(option.label)}
                                  </span>
                                )}
                                <span className="feature-flags-page__typeahead-text">
                                  <span className="feature-flags-page__typeahead-label">{option.label}</span>
                                  {option.subtitle ? (
                                    <span className="feature-flags-page__typeahead-sub">{option.subtitle}</span>
                                  ) : null}
                                  {option.meta ? (
                                    <span className="feature-flags-page__typeahead-meta">{option.meta}</span>
                                  ) : null}
                                </span>
                              </button>
                            )
                          )
                        ) : (
                          <div className="feature-flags-page__typeahead-empty">
                            {targetForm.target_type === "user" ? "No users found" : "No tenants found"}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {targetForm.target_key ? (
                      <div className="feature-flags-page__typeahead-selected">
                        Selected id: {targetForm.target_key}
                      </div>
                    ) : (
                      <div className="feature-flags-page__typeahead-selected">
                        Select a match to set target id.
                      </div>
                    )}
                  </div>
                )}
              </label>
              <label>
                Stage
                <KidDropdown
                  value={targetForm.stage}
                  onChange={(value) => setTargetForm((prev) => ({ ...prev, stage: value }))}
                  options={[
                    { value: "any", label: "any" },
                    { value: "dev", label: "dev" },
                    { value: "production", label: "production" },
                  ]}
                  fullWidth
                />
              </label>
              <label>
                Variant
                <input
                  value={targetForm.variant}
                  onChange={(event) => setTargetForm((prev) => ({ ...prev, variant: event.target.value }))}
                  placeholder="optional variant"
                />
              </label>
              <KidCheckbox checked={targetForm.enabled} onChange={(checked) => setTargetForm((prev) => ({ ...prev, enabled: checked }))}>
                Enable target
              </KidCheckbox>
              <button className="kid-button" type="submit" disabled={!isTargetDirty}>
                Save target
              </button>
            </form>
          </AccordionCard>
          <h4 className="feature-flags-page__section-title">Existing targets</h4>
          <ul className="feature-flags-page__existing-list">
            {targets.length ? (
              targets.map((target) => (
                <li key={target.id} className="feature-flags-page__existing-item">
                  <div className="feature-flags-page__existing-top">
                    <span className="feature-flags-page__status-chip">
                      {target.enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {target.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="feature-flags-page__badge">{target.target_type}</span>
                    <span className="feature-flags-page__badge">{target.stage}</span>
                    <button
                      type="button"
                      className="kid-button kid-button--ghost feature-flags-page__mini-btn"
                      onClick={() => startEditTarget(target)}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="feature-flags-page__existing-main">{target.target_key}</div>
                  {target.variant ? (
                    <div className="feature-flags-page__existing-meta">Variant: {target.variant}</div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="feature-flags-page__existing-empty">No targets configured yet.</li>
            )}
          </ul>
        </article>

        <article className="feature-flags-page__panel">
          <AccordionCard
            expanded={expandedPanel === "rules"}
            onToggle={() => setExpandedPanel((prev) => (prev === "rules" ? "none" : "rules"))}
            summary={
              <div>
                <h3 className="feature-flags-page__accordion-title">
                  <Sparkles size={18} />
                  Add rollout rule
                </h3>
                <p className="feature-flags-page__accordion-subtitle">
                  Configure attribute matching + percentage rollout for experiments.
                </p>
              </div>
            }
          >
            <form onSubmit={onAddRule} className="feature-flags-page__form">
              <label>
                Priority
                <input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
                />
              </label>
              <label>
                Match operator
                <KidDropdown
                  value={ruleForm.match_operator}
                  onChange={(value) => setRuleForm((prev) => ({ ...prev, match_operator: value }))}
                  options={[
                    { value: "all", label: "all" },
                    { value: "any", label: "any" },
                  ]}
                  fullWidth
                />
              </label>
              <KidCheckbox
                checked={ruleForm.use_specific_targeting}
                onChange={(checked) =>
                  setRuleForm((prev) => ({ ...prev, use_specific_targeting: checked }))
                }
              >
                Opt-in to specific targeting condition
              </KidCheckbox>
              <p className="feature-flags-page__helper">
                Default behavior: rollout applies to all users/tenants. Enable specific targeting only when needed.
              </p>
              <label>
                Attribute
                <input
                  value={ruleForm.attribute}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, attribute: event.target.value }))}
                  placeholder="region"
                  disabled={!ruleForm.use_specific_targeting}
                />
              </label>
              <label>
                Operator
                <KidDropdown
                  value={ruleForm.op}
                  onChange={(value) => setRuleForm((prev) => ({ ...prev, op: value }))}
                  options={[
                    { value: "eq", label: "eq" },
                    { value: "neq", label: "neq" },
                    { value: "in", label: "in" },
                    { value: "contains", label: "contains" },
                  ]}
                  fullWidth
                  disabled={!ruleForm.use_specific_targeting}
                />
              </label>
              <label>
                Value
                <input
                  value={ruleForm.value}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, value: event.target.value }))}
                  placeholder={ruleForm.use_specific_targeting ? "US" : "Not required for apply-to-all"}
                  disabled={!ruleForm.use_specific_targeting}
                />
              </label>
              <label>
                Rollout %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={ruleForm.rollout_percentage}
                  onChange={(event) =>
                    setRuleForm((prev) => ({ ...prev, rollout_percentage: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Variant
                <input
                  value={ruleForm.variant}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, variant: event.target.value }))}
                  placeholder="optional"
                />
              </label>
              <button className="kid-button" type="submit" disabled={!isRuleDirty}>
                Save rule
              </button>
            </form>
          </AccordionCard>
          <h4 className="feature-flags-page__section-title">Existing rollout rules</h4>
          <ul className="feature-flags-page__existing-list">
            {rules.length ? (
              rules.map((rule) => (
                <li key={rule.id} className="feature-flags-page__existing-item">
                  <div className="feature-flags-page__existing-top">
                    <span className="feature-flags-page__badge">Priority {rule.priority}</span>
                    <span className="feature-flags-page__badge">
                      Rollout {rule.rollout_percentage ?? 100}%
                    </span>
                    <button
                      type="button"
                      className="kid-button kid-button--ghost feature-flags-page__mini-btn"
                      onClick={() => startEditRule(rule)}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="feature-flags-page__existing-main">
                    {rule.conditions.length
                      ? rule.conditions
                          .map((c) => `${c.attribute} ${c.op} ${String(c.value)}`)
                          .join("  AND  ")
                      : "Match all users/tenants"}
                  </div>
                  {rule.variant ? (
                    <div className="feature-flags-page__existing-meta">Variant: {rule.variant}</div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="feature-flags-page__existing-empty">No rollout rules configured yet.</li>
            )}
          </ul>
        </article>
      </section>
      <KidDialog
        isOpen={Boolean(editingTarget)}
        onClose={() => setEditingTarget(null)}
        title="Edit target"
        showActions={false}
      >
        <form className="feature-flags-page__form" onSubmit={(event) => { event.preventDefault(); void onSaveEditedTarget(); }}>
          <label>
            Target type
            <KidDropdown
              value={editTargetForm.target_type}
              onChange={(value) => setEditTargetForm((prev) => ({ ...prev, target_type: value }))}
              options={[
                { value: "tenant", label: "tenant" },
                { value: "user", label: "user" },
                { value: "all", label: "all" },
              ]}
              fullWidth
            />
          </label>
          <label>
            Target key
            <input
              value={editTargetForm.target_key}
              onChange={(event) => setEditTargetForm((prev) => ({ ...prev, target_key: event.target.value }))}
            />
          </label>
          <label>
            Stage
            <KidDropdown
              value={editTargetForm.stage}
              onChange={(value) => setEditTargetForm((prev) => ({ ...prev, stage: value }))}
              options={[
                { value: "any", label: "any" },
                { value: "dev", label: "dev" },
                { value: "production", label: "production" },
              ]}
              fullWidth
            />
          </label>
          <label>
            Variant
            <input
              value={editTargetForm.variant}
              onChange={(event) => setEditTargetForm((prev) => ({ ...prev, variant: event.target.value }))}
            />
          </label>
          <KidCheckbox
            checked={editTargetForm.enabled}
            onChange={(checked) => setEditTargetForm((prev) => ({ ...prev, enabled: checked }))}
          >
            Enable target
          </KidCheckbox>
          <div className="kid-dialog__actions">
            <button type="button" className="kid-button kid-button--ghost" onClick={() => setEditingTarget(null)}>
              Cancel
            </button>
            <button type="submit" className="kid-button" disabled={!isEditTargetDirty}>
              Save
            </button>
          </div>
        </form>
      </KidDialog>

      <KidDialog
        isOpen={Boolean(editingRule)}
        onClose={() => setEditingRule(null)}
        title="Edit rollout rule"
        showActions={false}
      >
        <form className="feature-flags-page__form" onSubmit={(event) => { event.preventDefault(); void onSaveEditedRule(); }}>
          <label>
            Priority
            <input
              type="number"
              value={editRuleForm.priority}
              onChange={(event) => setEditRuleForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
            />
          </label>
          <label>
            Match operator
            <KidDropdown
              value={editRuleForm.match_operator}
              onChange={(value) => setEditRuleForm((prev) => ({ ...prev, match_operator: value }))}
              options={[
                { value: "all", label: "all" },
                { value: "any", label: "any" },
              ]}
              fullWidth
            />
          </label>
          <label>
            Attribute
            <input
              value={editRuleForm.attribute}
              onChange={(event) => setEditRuleForm((prev) => ({ ...prev, attribute: event.target.value }))}
            />
          </label>
          <label>
            Operator
            <KidDropdown
              value={editRuleForm.op}
              onChange={(value) => setEditRuleForm((prev) => ({ ...prev, op: value }))}
              options={[
                { value: "eq", label: "eq" },
                { value: "neq", label: "neq" },
                { value: "in", label: "in" },
                { value: "contains", label: "contains" },
              ]}
              fullWidth
            />
          </label>
          <label>
            Value
            <input
              value={editRuleForm.value}
              onChange={(event) => setEditRuleForm((prev) => ({ ...prev, value: event.target.value }))}
              placeholder="Leave empty to apply to all"
            />
          </label>
          <label>
            Rollout %
            <input
              type="number"
              min={0}
              max={100}
              value={editRuleForm.rollout_percentage}
              onChange={(event) =>
                setEditRuleForm((prev) => ({ ...prev, rollout_percentage: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            Variant
            <input
              value={editRuleForm.variant}
              onChange={(event) => setEditRuleForm((prev) => ({ ...prev, variant: event.target.value }))}
            />
          </label>
          <KidCheckbox
            checked={editRuleForm.enabled}
            onChange={(checked) => setEditRuleForm((prev) => ({ ...prev, enabled: checked }))}
          >
            Enable rule
          </KidCheckbox>
          <div className="kid-dialog__actions">
            <button type="button" className="kid-button kid-button--ghost" onClick={() => setEditingRule(null)}>
              Cancel
            </button>
            <button type="submit" className="kid-button" disabled={!isEditRuleDirty}>
              Save
            </button>
          </div>
        </form>
      </KidDialog>
    </div>
  );
}
