import { useEffect, useState } from "react";
import {
  getTenantGamificationConfig,
  updateTenantGamificationConfig,
  type TenantGamificationConfig,
} from "../../lib/api/gamification";
import { AppTooltip, KidDropdown, KidSwitch } from "../../components/ui";
import { CircleHelp } from "lucide-react";
import { GamificationFlowBuilder } from "./GamificationFlowBuilder";
import "../settings/settings.css";
import "./studio.css";

const LABS = [
  { id: "circuit-maker", name: "Circuit Maker" },
  { id: "micro-maker", name: "Micro Maker" },
  { id: "robotics-lab", name: "Robo Maker" },
  { id: "python-game", name: "Python Game Maker" },
  { id: "game-maker", name: "Game Maker" },
  { id: "design-maker", name: "Design Maker" },
];

const GAMIFICATION_MODES = [
  { value: "academic", label: "Academic (minimal gamification)" },
  { value: "light", label: "Light gamification" },
  { value: "balanced", label: "Balanced" },
  { value: "full", label: "Full gamification" },
];

const DEFAULT_GAMIFICATION_CONFIG: TenantGamificationConfig = {
  mode: "balanced",
  enabled: true,
  enabled_labs: [],
  max_points_per_event: 50,
  allow_badges: true,
  allow_live_recognition: true,
  allow_leaderboard: true,
  allow_streaks: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function FieldHint({ title, description }: { title: string; description: string }) {
  return (
    <AppTooltip title={title} description={description} placement="top">
      <button
        type="button"
        className="tenant-settings__hint-btn"
        aria-label={`Info: ${title}`}
      >
        <CircleHelp size={14} />
      </button>
    </AppTooltip>
  );
}

export function GamificationStudioPage() {
  const [cfg, setCfg] = useState<TenantGamificationConfig>(DEFAULT_GAMIFICATION_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const current = await getTenantGamificationConfig();
        if (!cancelled) setCfg(current);
      } catch {
        if (!cancelled) setCfg(DEFAULT_GAMIFICATION_CONFIG);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updateTenantGamificationConfig(cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save gamification policy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tenant-settings gamification-studio">
      <header className="tenant-settings__header">
        <div className="tenant-settings__panel-title-row">
          <h1 className="tenant-settings__title">Gamification Studio</h1>
          <FieldHint
            title="Gamification Studio"
            description="Configure tenant gamification mode and build nested puzzle goals using drag and drop."
          />
        </div>
        <p className="tenant-settings__subtitle">
          Dedicated workspace for policy, rules, and reward conditions
        </p>
      </header>

      <section className="tenant-settings__panel">
        <div className="tenant-settings__panel-title-row">
          <h2 className="tenant-settings__panel-title">Gamification Policy</h2>
          <FieldHint
            title="Gamification Policy"
            description="Control overall gamification intensity and guardrails before building goals."
          />
        </div>
        {loading ? (
          <p className="tenant-settings__panel-desc">Loading policy…</p>
        ) : (
          <>
            <div className="tenant-settings__form tenant-settings__form--rewards">
              <div className="tenant-settings__field">
                <label htmlFor="gamification-mode-studio">Mode</label>
                <KidDropdown
                  value={cfg.mode}
                  onChange={(value) =>
                    setCfg((prev) => ({
                      ...prev,
                      mode:
                        value === "academic" ||
                        value === "light" ||
                        value === "balanced" ||
                        value === "full"
                          ? value
                          : prev.mode,
                    }))
                  }
                  fullWidth
                  ariaLabel="Gamification mode"
                  options={GAMIFICATION_MODES}
                />
              </div>
              <div className="tenant-settings__field">
                <label htmlFor="gamification-max-points-studio">Max points per lab event</label>
                <input
                  id="gamification-max-points-studio"
                  type="number"
                  min={1}
                  max={500}
                  value={cfg.max_points_per_event}
                  onChange={(event) =>
                    setCfg((prev) => ({
                      ...prev,
                      max_points_per_event: clamp(Number(event.target.value) || 1, 1, 500),
                    }))
                  }
                  className="tenant-settings__input"
                />
              </div>
            </div>

            <div className="tenant-settings__toggles">
              <div className="tenant-settings__toggle-row">
                <span className="tenant-settings__toggle-label">Enable gamification</span>
                <KidSwitch
                  checked={cfg.enabled}
                  onChange={(next) => setCfg((prev) => ({ ...prev, enabled: next }))}
                  ariaLabel="Enable gamification"
                />
              </div>
              <div className="tenant-settings__toggle-row">
                <span className="tenant-settings__toggle-label">Allow stickers</span>
                <KidSwitch
                  checked={cfg.allow_badges}
                  onChange={(next) => setCfg((prev) => ({ ...prev, allow_badges: next }))}
                  ariaLabel="Allow stickers"
                />
              </div>
              <div className="tenant-settings__toggle-row">
                <span className="tenant-settings__toggle-label">Allow leaderboard</span>
                <KidSwitch
                  checked={cfg.allow_leaderboard}
                  onChange={(next) => setCfg((prev) => ({ ...prev, allow_leaderboard: next }))}
                  ariaLabel="Allow leaderboard"
                />
              </div>
              <div className="tenant-settings__toggle-row">
                <span className="tenant-settings__toggle-label">Allow streaks</span>
                <KidSwitch
                  checked={cfg.allow_streaks}
                  onChange={(next) => setCfg((prev) => ({ ...prev, allow_streaks: next }))}
                  ariaLabel="Allow streaks"
                />
              </div>
              <div className="tenant-settings__toggle-row">
                <span className="tenant-settings__toggle-label">Allow live recognition popups</span>
                <KidSwitch
                  checked={cfg.allow_live_recognition}
                  onChange={(next) =>
                    setCfg((prev) => ({ ...prev, allow_live_recognition: next }))
                  }
                  ariaLabel="Allow live recognition popups"
                />
              </div>
            </div>

            <div className="tenant-settings__toggles" style={{ marginTop: 12 }}>
              {LABS.map((lab) => {
                const enabled = cfg.enabled_labs.includes(lab.id);
                return (
                  <div key={`studio-gamification-lab-${lab.id}`} className="tenant-settings__toggle-row">
                    <span className="tenant-settings__toggle-label">{lab.name} events</span>
                    <KidSwitch
                      checked={enabled}
                      onChange={(next) =>
                        setCfg((prev) => {
                          const current = new Set(prev.enabled_labs);
                          if (next) current.add(lab.id);
                          else current.delete(lab.id);
                          return { ...prev, enabled_labs: Array.from(current) };
                        })
                      }
                      ariaLabel={`Enable ${lab.name} gamification events`}
                    />
                  </div>
                );
              })}
            </div>

            {error ? <p className="tenant-settings__reward-error">{error}</p> : null}
            <div className="ui-form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : saved ? "Saved!" : "Save Gamification Policy"}
              </button>
            </div>
          </>
        )}
      </section>

      <div style={{ marginTop: 16 }}>
        <GamificationFlowBuilder />
      </div>
    </div>
  );
}

