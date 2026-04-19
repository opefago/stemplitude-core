import { Settings, X } from "lucide-react";
import { KidDropdown } from "../../../components/ui/KidDropdown";

interface ViewportSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  moveCollisionPolicy: string;
  onMoveCollisionPolicyChange: (policy: string) => void;
  physicsEngine?: string;
  onPhysicsEngineChange?: (engine: string) => void;
  tractionLongitudinal?: number;
  onTractionLongitudinalChange?: (value: number) => void;
  tractionLateral?: number;
  onTractionLateralChange?: (value: number) => void;
  rollingResistance?: number;
  onRollingResistanceChange?: (value: number) => void;
  robotMaxClimbSlopeDeg?: number;
  onRobotMaxClimbSlopeDegChange?: (value: number) => void;
}

const BG_PRESETS = ["#f7f8fa", "#f4f6f8", "#f1f3f5", "#eef1f4", "#eceff3"];

export function ViewportSettingsDialog({
  open,
  onClose,
  backgroundColor,
  onBackgroundColorChange,
  moveCollisionPolicy,
  onMoveCollisionPolicyChange,
  physicsEngine,
  onPhysicsEngineChange,
  tractionLongitudinal,
  onTractionLongitudinalChange,
  tractionLateral,
  onTractionLateralChange,
  rollingResistance,
  onRollingResistanceChange,
  robotMaxClimbSlopeDeg,
  onRobotMaxClimbSlopeDegChange,
}: ViewportSettingsDialogProps) {
  if (!open) return null;

  return (
    <div className="robotics-modal-overlay" onClick={onClose}>
      <div className="robotics-settings-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="robotics-settings-dialog__header">
          <div className="robotics-settings-dialog__title">
            <Settings size={18} />
            <h3>Simulator Settings</h3>
          </div>
          <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="robotics-settings-dialog__body">
          <section className="robotics-settings-dialog__section">
            <h4 className="robotics-settings-dialog__section-title">Appearance</h4>
            <label className="robotics-form-field">
              <span>Background color</span>
              <div className="robotics-settings-dialog__color-row">
                <input type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} />
                <span className="robotics-settings-dialog__color-hex">{backgroundColor}</span>
              </div>
              <div className="robotics-bg-presets">
                {BG_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className={`robotics-bg-chip${preset.toLowerCase() === backgroundColor.toLowerCase() ? " active" : ""}`}
                    onClick={() => onBackgroundColorChange(preset)}
                    style={{ background: preset }}
                    title={`Use ${preset}`}
                  />
                ))}
              </div>
            </label>
          </section>

          <section className="robotics-settings-dialog__section">
            <h4 className="robotics-settings-dialog__section-title">Behavior</h4>
            <div className="robotics-form-field">
              <span>Move collision behavior</span>
              <KidDropdown
                value={moveCollisionPolicy}
                onChange={onMoveCollisionPolicyChange}
                ariaLabel="Move collision behavior"
                fullWidth
                subtle={false}
                options={[
                  { value: "hold_until_distance", label: "Hold until target distance" },
                  { value: "abort_on_collision", label: "Abort and continue" },
                  { value: "timeout_then_continue", label: "Wait timeout, then continue" },
                  { value: "error_on_collision", label: "Stop with error" },
                ]}
              />
            </div>
            {onPhysicsEngineChange ? (
              <div className="robotics-form-field">
                <span>Physics engine</span>
                <KidDropdown
                  value={physicsEngine || "three_runtime"}
                  onChange={onPhysicsEngineChange}
                  ariaLabel="Physics engine"
                  fullWidth
                  subtle={false}
                  options={[
                    { value: "three_runtime", label: "Three Runtime (default)" },
                    { value: "grid_world", label: "Grid World (deterministic)" },
                    { value: "rapier", label: "Rapier adapter slot" },
                  ]}
                />
              </div>
            ) : null}
          </section>

          <section className="robotics-settings-dialog__section">
            <h4 className="robotics-settings-dialog__section-title">Physics Tuning</h4>
            <div className="robotics-settings-dialog__grid">
              {onTractionLongitudinalChange ? (
                <label className="robotics-form-field" htmlFor="traction-longitudinal">
                  <span>Traction (long.)</span>
                  <input
                    id="traction-longitudinal"
                    type="number"
                    min={0.2}
                    max={1.2}
                    step={0.05}
                    value={Number(tractionLongitudinal ?? 0.92)}
                    onChange={(event) => onTractionLongitudinalChange(Number(event.target.value))}
                  />
                </label>
              ) : null}
              {onTractionLateralChange ? (
                <label className="robotics-form-field" htmlFor="traction-lateral">
                  <span>Traction (lat.)</span>
                  <input
                    id="traction-lateral"
                    type="number"
                    min={0.2}
                    max={1.2}
                    step={0.05}
                    value={Number(tractionLateral ?? 0.9)}
                    onChange={(event) => onTractionLateralChange(Number(event.target.value))}
                  />
                </label>
              ) : null}
              {onRollingResistanceChange ? (
                <label className="robotics-form-field" htmlFor="rolling-resistance">
                  <span>Rolling resistance</span>
                  <input
                    id="rolling-resistance"
                    type="number"
                    min={0}
                    max={20}
                    step={0.2}
                    value={Number(rollingResistance ?? 4.2)}
                    onChange={(event) => onRollingResistanceChange(Number(event.target.value))}
                  />
                </label>
              ) : null}
              {onRobotMaxClimbSlopeDegChange ? (
                <label className="robotics-form-field" htmlFor="robot-max-climb-slope">
                  <span>Max climb slope (deg)</span>
                  <input
                    id="robot-max-climb-slope"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={Number(robotMaxClimbSlopeDeg ?? 16)}
                    onChange={(event) => onRobotMaxClimbSlopeDegChange(Number(event.target.value))}
                  />
                </label>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
