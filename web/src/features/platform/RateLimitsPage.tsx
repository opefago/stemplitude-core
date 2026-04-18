import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteRateLimitOverride,
  getEffectiveRateLimit,
  listRateLimitOverrides,
  listRateLimitProfiles,
  searchRateLimitTenants,
  searchRateLimitUsers,
  upsertRateLimitOverride,
  type EffectiveRateLimitResponse,
  type RateLimitOverride,
  type RateLimitProfile,
} from "../../lib/api/platform";
import { KidDropdown } from "../../components/ui";
import "./rate-limits-page.css";

const DEFAULT_PATH = "/api/v1/auth/me";

export function RateLimitsPage() {
  const [profiles, setProfiles] = useState<RateLimitProfile[]>([]);
  const [overrides, setOverrides] = useState<RateLimitOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<"tenant" | "user">("tenant");
  const [mode, setMode] = useState<"profile_only" | "custom_only" | "profile_plus_custom">(
    "profile_only"
  );
  const [profileKey, setProfileKey] = useState("");
  const [customLimit, setCustomLimit] = useState<string>("");
  const [customWindowSeconds, setCustomWindowSeconds] = useState<string>("");
  const [reason, setReason] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetResults, setTargetResults] = useState<
    Array<{ id: string; label: string; subtitle: string }>
  >([]);
  const [targetId, setTargetId] = useState("");
  const [effectivePath, setEffectivePath] = useState(DEFAULT_PATH);
  const [effective, setEffective] = useState<EffectiveRateLimitResponse | null>(null);

  const profileOptions = useMemo(
    () => profiles.map((profile) => ({ value: profile.key, label: profile.key })),
    [profiles]
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRows, overrideRows] = await Promise.all([
        listRateLimitProfiles(),
        listRateLimitOverrides({ limit: 100 }),
      ]);
      setProfiles(profileRows);
      setOverrides(overrideRows.items);
      setProfileKey((prev) => prev || profileRows[0]?.key || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rate limits");
    } finally {
      setLoading(false);
    }
  };

  const loadEffective = async (nextPath: string, nextScopeId?: string) => {
    try {
      const response = await getEffectiveRateLimit({
        path: nextPath,
        user_id: scopeType === "user" ? nextScopeId || targetId : undefined,
        tenant_id: scopeType === "tenant" ? nextScopeId || targetId : undefined,
      });
      setEffective(response);
    } catch (err) {
      setEffective(null);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!targetQuery.trim()) {
      setTargetResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results =
          scopeType === "user"
            ? await searchRateLimitUsers(targetQuery.trim(), 10)
            : await searchRateLimitTenants(targetQuery.trim(), 10);
        if (cancelled) return;
        setTargetResults(
          results.map((row) =>
            scopeType === "user"
              ? {
                  id: row.id,
                  label: row.full_name || row.email,
                  subtitle: row.email,
                }
              : {
                  id: row.id,
                  label: row.name,
                  subtitle: `${row.slug} (${row.type})`,
                }
          )
        );
      } catch {
        if (!cancelled) setTargetResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetQuery, scopeType]);

  useEffect(() => {
    if (!profiles.length) return;
    void loadEffective(effectivePath);
  }, [profiles.length, effectivePath, scopeType, targetId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetId) {
      setError(`Select a ${scopeType} first.`);
      return;
    }
    if ((mode === "profile_only" || mode === "profile_plus_custom") && !profileKey) {
      setError("Select a profile for this mode.");
      return;
    }
    if (mode === "custom_only" && (!customLimit || !customWindowSeconds)) {
      setError("Custom mode requires both custom limit and custom window.");
      return;
    }
    if (mode === "profile_plus_custom" && !customLimit && !customWindowSeconds) {
      setError("Profile + custom mode requires at least one custom value.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await upsertRateLimitOverride({
        scope_type: scopeType,
        scope_id: targetId,
        mode,
        profile_key:
          mode === "profile_only" || mode === "profile_plus_custom"
            ? profileKey
            : null,
        custom_limit: customLimit ? Number(customLimit) : null,
        custom_window_seconds: customWindowSeconds
          ? Number(customWindowSeconds)
          : null,
        reason: reason.trim() || null,
      });
      await loadData();
      await loadEffective(effectivePath, targetId);
      setMessage("Override saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: RateLimitOverride) => {
    setError(null);
    setMessage(null);
    try {
      await deleteRateLimitOverride(row.scope_type, row.scope_id);
      await loadData();
      setMessage("Override removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove override");
    }
  };

  return (
    <div className="rate-limits-page">
      <header className="rate-limits-page__header">
        <h1>Rate Limits</h1>
        <p>
          Manage tier profiles per tenant/user and preview effective API behavior.
        </p>
      </header>

      {loading && <div className="rate-limits-page__notice">Loading rate limits...</div>}
      {error && <div className="rate-limits-page__error">{error}</div>}
      {message && <div className="rate-limits-page__notice">{message}</div>}

      <section className="rate-limits-page__grid">
        <article className="rate-limits-page__card">
          <h2>Assign Profile Override</h2>
          <form onSubmit={onSubmit} className="rate-limits-page__form">
            <label>
              Scope
              <KidDropdown
                value={scopeType}
                onChange={(value) => {
                  setScopeType(value as "tenant" | "user");
                  setTargetId("");
                  setTargetQuery("");
                  setTargetResults([]);
                }}
                options={[
                  { value: "tenant", label: "tenant" },
                  { value: "user", label: "user" },
                ]}
                fullWidth
              />
            </label>
            <label>
              Mode
              <KidDropdown
                value={mode}
                onChange={(value) =>
                  setMode(value as "profile_only" | "custom_only" | "profile_plus_custom")
                }
                options={[
                  { value: "profile_only", label: "preset only" },
                  { value: "custom_only", label: "custom only" },
                  { value: "profile_plus_custom", label: "preset + custom" },
                ]}
                fullWidth
              />
            </label>
            <label>
              Search {scopeType}
              <input
                value={targetQuery}
                onChange={(event) => {
                  setTargetQuery(event.target.value);
                  setTargetId("");
                }}
                placeholder={
                  scopeType === "user"
                    ? "Search by email or name"
                    : "Search by tenant name/slug"
                }
              />
            </label>
            {targetResults.length > 0 && (
              <div className="rate-limits-page__results">
                {targetResults.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`rate-limits-page__result ${targetId === row.id ? "is-selected" : ""}`}
                    onClick={() => {
                      setTargetId(row.id);
                      setTargetQuery(`${row.label} (${row.subtitle})`);
                    }}
                  >
                    <strong>{row.label}</strong>
                    <span>{row.subtitle}</span>
                  </button>
                ))}
              </div>
            )}
            {(mode === "profile_only" || mode === "profile_plus_custom") && (
              <label>
                Preset profile
                <KidDropdown
                  value={profileKey}
                  onChange={setProfileKey}
                  options={profileOptions}
                  fullWidth
                />
              </label>
            )}
            {(mode === "custom_only" || mode === "profile_plus_custom") && (
              <>
                <label>
                  Custom limit (requests)
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={customLimit}
                    onChange={(event) => setCustomLimit(event.target.value)}
                    placeholder={
                      mode === "profile_plus_custom" ? "Optional override" : "Required"
                    }
                  />
                </label>
                <label>
                  Custom window (seconds)
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    value={customWindowSeconds}
                    onChange={(event) => setCustomWindowSeconds(event.target.value)}
                    placeholder={
                      mode === "profile_plus_custom" ? "Optional override" : "Required"
                    }
                  />
                </label>
              </>
            )}
            <label>
              Reason
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional context for auditability"
              />
            </label>
            <button className="kid-button" type="submit" disabled={saving}>
              Save override
            </button>
          </form>
        </article>

        <article className="rate-limits-page__card">
          <h2>Effective Policy Preview</h2>
          <label className="rate-limits-page__path-label">
            API path
            <input
              value={effectivePath}
              onChange={(event) => setEffectivePath(event.target.value)}
              placeholder="/api/v1/auth/me"
            />
          </label>
          {effective ? (
            <div className="rate-limits-page__effective">
              <div>
                <span>Route class</span>
                <strong>{effective.route_class}</strong>
              </div>
              <div>
                <span>Failure mode</span>
                <strong>{effective.failure_mode}</strong>
              </div>
              <div>
                <span>Route profile</span>
                <strong>{effective.route_profile_key}</strong>
              </div>
              <div>
                <span>User profile</span>
                <strong>{effective.user_profile?.key ?? "n/a"}</strong>
              </div>
              <div>
                <span>Tenant profile</span>
                <strong>{effective.tenant_profile?.key ?? "n/a"}</strong>
              </div>
              <div>
                <span>Anonymous profile</span>
                <strong>{effective.anonymous_profile.key}</strong>
              </div>
            </div>
          ) : (
            <p className="rate-limits-page__muted">
              No preview data available yet.
            </p>
          )}
        </article>
      </section>

      <section className="rate-limits-page__card">
        <h2>Current Overrides</h2>
        <div className="rate-limits-page__table">
          {overrides.map((row) => (
            <div key={row.id} className="rate-limits-page__table-row">
              <div>
                <strong>{row.scope_label || row.scope_id}</strong>
                <span>
                  {row.scope_type} · {row.scope_subtitle || row.scope_id}
                </span>
              </div>
              <div>
                <strong>
                  {row.profile_key || "custom-only"} ({row.mode})
                </strong>
                <span>{row.reason || "No reason provided"}</span>
                <span>
                  custom:{" "}
                  {row.custom_limit != null || row.custom_window_seconds != null
                    ? `${row.custom_limit ?? "-"} req / ${row.custom_window_seconds ?? "-"} sec`
                    : "none"}
                </span>
              </div>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => void onDelete(row)}
              >
                Remove
              </button>
            </div>
          ))}
          {!overrides.length && (
            <p className="rate-limits-page__muted">No overrides configured.</p>
          )}
        </div>
      </section>
    </div>
  );
}
