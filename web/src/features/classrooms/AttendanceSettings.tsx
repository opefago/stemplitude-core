/**
 * Reusable attendance policy form used in Tenant Settings, Program dialog,
 * and Classroom settings.
 *
 * When `allowInherit` is true (program & classroom level) a "Use default" option
 * renders a toggle that clears the local override so the parent level applies.
 */
import { KidDropdown, KidSwitch } from "../../components/ui";

export interface AttendanceConfig {
  enabled: boolean;
  mode: "any_join" | "minimum_duration" | "percentage_duration";
  minimum_minutes: number;
  percentage: number;
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  enabled: true,
  mode: "any_join",
  minimum_minutes: 15,
  percentage: 75,
};

const MODE_OPTIONS = [
  { value: "any_join", label: "Any connection (student connected at all)" },
  { value: "minimum_duration", label: "Minimum duration (connected for N minutes)" },
  { value: "percentage_duration", label: "Percentage of class (connected for X% of session)" },
];

interface Props {
  /** Current config value; null means "inherit from parent" (only valid when allowInherit=true). */
  value: AttendanceConfig | null;
  onChange: (next: AttendanceConfig | null) => void;
  /** When true, show a "Use default" option that clears the local override. */
  allowInherit?: boolean;
  /** Label shown next to the toggle when allowInherit=true. */
  inheritLabel?: string;
  saving?: boolean;
}

export function AttendanceSettings({
  value,
  onChange,
  allowInherit = false,
  inheritLabel = "Use parent default",
  saving = false,
}: Props) {
  const isInheriting = value === null;
  const cfg: AttendanceConfig = value ?? DEFAULT_ATTENDANCE_CONFIG;

  const set = (patch: Partial<AttendanceConfig>) => {
    onChange({ ...cfg, ...patch });
  };

  if (allowInherit && isInheriting) {
    return (
      <div className="attendance-settings">
        <div className="tenant-settings__toggle-row" role="group" aria-label="Use parent default">
          <label htmlFor="attend-inherit" className="tenant-settings__toggle-label">
            {inheritLabel}
          </label>
          <KidSwitch
            id="attend-inherit"
            checked={true}
            onChange={(checked) => {
              if (!checked) onChange(DEFAULT_ATTENDANCE_CONFIG);
            }}
            ariaLabel="Use parent attendance default"
          />
        </div>
        <p className="attendance-settings__hint">
          Attendance policy is inherited from the parent level.
        </p>
      </div>
    );
  }

  return (
    <div className="attendance-settings" aria-disabled={saving}>
      {allowInherit && (
        <div className="tenant-settings__toggle-row" role="group" aria-label="Use parent default">
          <label htmlFor="attend-inherit" className="tenant-settings__toggle-label">
            {inheritLabel}
          </label>
          <KidSwitch
            id="attend-inherit"
            checked={false}
            onChange={(checked) => {
              if (checked) onChange(null);
            }}
            ariaLabel="Use parent attendance default"
          />
        </div>
      )}

      <div className="tenant-settings__toggle-row" role="group" aria-label="Enable attendance tracking">
        <label htmlFor="attend-enabled" className="tenant-settings__toggle-label">
          Enable automatic attendance tracking
        </label>
        <KidSwitch
          id="attend-enabled"
          checked={cfg.enabled}
          onChange={(v) => set({ enabled: v })}
          ariaLabel="Enable automatic attendance tracking"
        />
      </div>

      {cfg.enabled && (
        <>
          <div className="tenant-settings__field">
            <label htmlFor="attend-mode">Attendance rule</label>
            <KidDropdown
              value={cfg.mode}
              onChange={(v) =>
                set({ mode: v as AttendanceConfig["mode"] })
              }
              fullWidth
              ariaLabel="Attendance mode"
              options={MODE_OPTIONS}
            />
          </div>

          {cfg.mode === "minimum_duration" && (
            <div className="tenant-settings__field">
              <label htmlFor="attend-min-minutes">Minimum minutes present</label>
              <input
                id="attend-min-minutes"
                type="number"
                min={1}
                max={600}
                value={cfg.minimum_minutes}
                onChange={(e) =>
                  set({ minimum_minutes: Math.max(1, Number(e.target.value) || 1) })
                }
                className="tenant-settings__input"
              />
            </div>
          )}

          {cfg.mode === "percentage_duration" && (
            <div className="tenant-settings__field">
              <label htmlFor="attend-pct">Minimum percentage of session</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  id="attend-pct"
                  type="number"
                  min={1}
                  max={100}
                  value={cfg.percentage}
                  onChange={(e) =>
                    set({
                      percentage: Math.min(100, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                  className="tenant-settings__input"
                  style={{ width: 80 }}
                />
                <span style={{ color: "var(--color-text-secondary, #9ca3af)" }}>%</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
