import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Plus, Search, Sparkles, Wand2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createPlatformFeatureFlag,
  evaluatePlatformFeatureFlag,
  listPlatformFeatureFlags,
  syncPlatformFeatureFlagRegistry,
  type PlatformFeatureFlag,
} from "../../lib/api/platform";
import {
  KidDialog,
  KidCheckbox,
  KidDropdown,
  KidSwitch,
  StatCard,
} from "../../components/ui";
import "./feature-flags-page.css";

const STATUS_OPTIONS = ["draft", "active", "paused", "deprecated", "archived"];
const STAGE_OPTIONS = ["dev", "production", "all"];
const CREATE_LOCK_FLAG_KEY = "feature_flags_ui_create_locked";
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9_]{1,119}$/;
const PAGE_SIZE = 20;

export function FeatureFlagsPage() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createLockedByFlag, setCreateLockedByFlag] = useState(false);
  const [createLockReason, setCreateLockReason] = useState<string>("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [flags, setFlags] = useState<PlatformFeatureFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    key: "",
    owner: "",
    status: "draft",
    description: "",
    stage: "dev",
  });

  const createKeyValidationError = useMemo(() => {
    if (!createForm.key.trim()) return "";
    if (SNAKE_CASE_PATTERN.test(createForm.key.trim())) return "";
    return "Use snake_case, starting with a letter (e.g. lesson_tracking_v2).";
  }, [createForm.key]);

  const canCreateFromUi = !createLockedByFlag;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount]
  );

  const loadFlags = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listPlatformFeatureFlags(includeArchived, {
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        q: query.trim() || undefined,
        status: statusFilter,
        stage: stageFilter,
      });
      setFlags(response.items);
      setTotalCount(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  const loadCreateLockFlag = async () => {
    try {
      const evaluation = await evaluatePlatformFeatureFlag(CREATE_LOCK_FLAG_KEY);
      setCreateLockedByFlag(Boolean(evaluation.enabled));
      setCreateLockReason(
        evaluation.enabled
          ? "Creation is currently locked by YAML policy."
          : "Creation is currently enabled for on-the-fly testing."
      );
    } catch (err) {
      setCreateLockedByFlag(false);
      setCreateLockReason(
        err instanceof Error
          ? `Could not evaluate ${CREATE_LOCK_FLAG_KEY}: ${err.message}`
          : `Could not evaluate ${CREATE_LOCK_FLAG_KEY}.`
      );
    }
  };

  useEffect(() => {
    void loadFlags();
    void loadCreateLockFlag();
  }, [includeArchived, page, query, statusFilter, stageFilter]);

  useEffect(() => {
    setPage(1);
  }, [includeArchived, query, statusFilter, stageFilter]);

  const onCreateFlag = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateFromUi) {
      setError("Feature creation from UI is locked by feature flag policy.");
      return;
    }
    if (createKeyValidationError) {
      setError(createKeyValidationError);
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await createPlatformFeatureFlag({
        key: createForm.key.trim(),
        owner: createForm.owner.trim(),
        status: createForm.status,
        description: createForm.description.trim(),
        stage: createForm.stage,
        default_enabled: false,
        allow_debug_events: false,
        fail_mode: "closed",
      });
      setCreateForm({
        key: "",
        owner: "",
        status: "draft",
        description: "",
        stage: "dev",
      });
      setIsCreateDialogOpen(false);
      await loadFlags();
      setMessage("Feature flag created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create flag");
    }
  };

  const onSyncRegistry = async () => {
    setError(null);
    setMessage(null);
    try {
      const result = await syncPlatformFeatureFlagRegistry();
      await loadFlags();
      await loadCreateLockFlag();
      setMessage(
        `Registry sync complete: loaded ${result.loaded}, created ${result.created}, updated ${result.updated}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registry sync failed");
    }
  };

  const activeFlagsCount = flags.filter((flag) => flag.status === "active").length;
  const enabledDefaultsCount = flags.filter((flag) => flag.default_enabled).length;

  return (
    <div className="feature-flags-page">
      <header className="feature-flags-page__header">
        <div className="feature-flags-page__title-wrap">
          <h1>Feature Flags</h1>
          <p>Internal flag controls with tenant/user targeting and aggregate analytics.</p>
          <div className="feature-flags-page__header-stats">
            <span>{flags.length} flags</span>
            <span>{totalCount} total</span>
            <span>{activeFlagsCount} active</span>
            <span>{enabledDefaultsCount} default-on</span>
          </div>
        </div>
        <div className="feature-flags-page__header-actions">
          <KidCheckbox
            checked={includeArchived}
            onChange={setIncludeArchived}
            compact
          >
            Include archived
          </KidCheckbox>
          <button type="button" className="kid-button kid-button--ghost" onClick={() => void loadFlags()}>
            Refresh
          </button>
          <button type="button" className="kid-button" onClick={onSyncRegistry}>
            Sync YAML Registry
          </button>
          <button
            type="button"
            className="kid-button"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus size={16} />
            Create flag
          </button>
        </div>
      </header>

      {loading && <div className="feature-flags-page__notice">Loading feature flags...</div>}
      {error && (
        <div className="feature-flags-page__error">
          <strong>{error}</strong>
          {error.toLowerCase().includes("authorization header required") && (
            <p>
              Session token was not attached to this request. Refresh this page or sign out/in to reload auth context.
            </p>
          )}
        </div>
      )}
      {message && <div className="feature-flags-page__notice">{message}</div>}

      <section className="feature-flags-page__stats">
        <StatCard
          titleFirst
          label="Policy"
          value={createLockedByFlag ? "UI Creation Locked" : "UI Creation Enabled"}
          hint={createLockReason || "Policy evaluation unavailable."}
          icon={<Lock size={18} />}
        />
        <StatCard
          titleFirst
          label="Flags"
          value={flags.length}
          hint={`${totalCount} total`}
          icon={<Sparkles size={18} />}
        />
        <StatCard
          titleFirst
          label="Default On"
          value={enabledDefaultsCount}
          hint="Flags enabled by default"
          icon={<Wand2 size={18} />}
        />
      </section>

      <section className="feature-flags-page__panel feature-flags-page__panel--list">
        <div className="feature-flags-page__filters">
          <label className="feature-flags-page__search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by key, owner, description"
            />
          </label>
          <KidDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: "all", label: "all statuses" }, ...STATUS_OPTIONS.map((v) => ({ value: v, label: v }))]}
            minWidth={180}
          />
          <KidDropdown
            value={stageFilter}
            onChange={setStageFilter}
            options={[{ value: "all", label: "all stages" }, ...STAGE_OPTIONS.map((v) => ({ value: v, label: v }))]}
            minWidth={160}
          />
        </div>
        <div className="feature-flags-page__flag-list">
          {flags.map((flag) => (
            <button
              key={flag.id}
              type="button"
              className="feature-flags-page__flag-item"
              onClick={() => navigate(`/app/platform/feature-flags/${flag.id}`)}
            >
              <div>
                <strong>{flag.key}</strong>
                <small>
                  {flag.owner} · {flag.status} · {flag.stage}
                </small>
              </div>
              <span className="feature-flags-page__status-chip">
                {flag.default_enabled ? (
                  <>
                    <CheckCircle2 size={14} />
                    On
                  </>
                ) : (
                  <>
                    <XCircle size={14} />
                    Off
                  </>
                )}
              </span>
            </button>
          ))}
          {!flags.length && (
            <div className="feature-flags-page__sparkline-empty">No flags match current filters.</div>
          )}
        </div>
        <div className="feature-flags-page__pagination">
          <button
            type="button"
            className="kid-button kid-button--ghost"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <span>
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          <button
            type="button"
            className="kid-button kid-button--ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </button>
        </div>
      </section>

      <KidDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        title="Create feature flag"
        description="Create temporary flags from UI for testing. YAML policy still controls allowed workflow."
        showActions={false}
      >
        <div className="feature-flags-page__panel-heading">
          <span>UI creation</span>
          <KidSwitch
            checked={!createLockedByFlag}
            onChange={() => {}}
            disabled
            ariaLabel="UI creation lock indicator"
            size="sm"
          />
        </div>
        <form onSubmit={onCreateFlag} className="feature-flags-page__form">
          <label>
            Key
            <input
              value={createForm.key}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  key: event.target.value.trim().toLowerCase().replace(/\s+/g, "_"),
                }))
              }
              placeholder="robotics_new_runtime (snake_case)"
              required
              disabled={!canCreateFromUi}
            />
          </label>
          {createKeyValidationError && (
            <p className="feature-flags-page__field-error">{createKeyValidationError}</p>
          )}
          <label>
            Owner
            <input
              value={createForm.owner}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, owner: event.target.value }))}
              placeholder="team-or-user"
              required
              disabled={!canCreateFromUi}
            />
          </label>
          <label>
            Status
            <KidDropdown
              value={createForm.status}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, status: value }))}
              options={STATUS_OPTIONS.map((option) => ({ value: option, label: option }))}
              fullWidth
              disabled={!canCreateFromUi}
            />
          </label>
          <label>
            Stage
            <KidDropdown
              value={createForm.stage}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, stage: value }))}
              options={STAGE_OPTIONS.map((option) => ({ value: option, label: option }))}
              fullWidth
              disabled={!canCreateFromUi}
            />
          </label>
          <label>
            Description
            <textarea
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={3}
              disabled={!canCreateFromUi}
            />
          </label>
          <div className="kid-dialog__actions">
            <button type="button" className="kid-button kid-button--ghost" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </button>
            <button
              className="kid-button"
              type="submit"
              disabled={!canCreateFromUi || Boolean(createKeyValidationError)}
            >
              Create flag
            </button>
          </div>
          {!canCreateFromUi && (
            <p className="feature-flags-page__helper">
              UI creation is disabled by `{CREATE_LOCK_FLAG_KEY}`. Add flag definitions in YAML for version-controlled changes.
            </p>
          )}
        </form>
      </KidDialog>
    </div>
  );
}
