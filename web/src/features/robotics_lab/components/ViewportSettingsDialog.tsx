import { X } from "lucide-react";

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
}: ViewportSettingsDialogProps) {
  if (!open) return null;

  return (
    <div className="robotics-modal-overlay" onClick={onClose}>
      <div className="robotics-modal" onClick={(event) => event.stopPropagation()}>
        <div className="robotics-modal-header">
          <h3>Viewport Settings</h3>
          <button className="robotics-modal-close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>
        <div className="robotics-modal-body">
          <div className="robotics-modal-row">
            <label>Background color</label>
            <div className="robotics-bg-picker">
              <input type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} />
              <span>{backgroundColor}</span>
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
          </div>
          <div className="robotics-modal-row">
            <label htmlFor="move-collision-policy">Move collision behavior</label>
            <select
              id="move-collision-policy"
              value={moveCollisionPolicy}
              onChange={(event) => onMoveCollisionPolicyChange(event.target.value)}
            >
              <option value="hold_until_distance">Hold until target distance is reached</option>
              <option value="abort_on_collision">Abort move and continue</option>
              <option value="timeout_then_continue">Wait until timeout, then continue</option>
              <option value="error_on_collision">Stop with runtime error</option>
            </select>
          </div>
          {onPhysicsEngineChange ? (
            <div className="robotics-modal-row">
              <label htmlFor="physics-engine">Physics engine</label>
              <select
                id="physics-engine"
                value={physicsEngine || "three_runtime"}
                onChange={(event) => onPhysicsEngineChange(event.target.value)}
              >
                <option value="three_runtime">Three Runtime (default)</option>
                <option value="grid_world">Grid World (deterministic)</option>
                <option value="rapier">Rapier adapter slot</option>
              </select>
            </div>
          ) : null}
          {onTractionLongitudinalChange ? (
            <div className="robotics-modal-row">
              <label htmlFor="traction-longitudinal">Tire traction (longitudinal)</label>
              <input
                id="traction-longitudinal"
                type="number"
                min={0.2}
                max={1.2}
                step={0.05}
                value={Number(tractionLongitudinal ?? 0.92)}
                onChange={(event) => onTractionLongitudinalChange(Number(event.target.value))}
              />
            </div>
          ) : null}
          {onTractionLateralChange ? (
            <div className="robotics-modal-row">
              <label htmlFor="traction-lateral">Tire traction (lateral)</label>
              <input
                id="traction-lateral"
                type="number"
                min={0.2}
                max={1.2}
                step={0.05}
                value={Number(tractionLateral ?? 0.9)}
                onChange={(event) => onTractionLateralChange(Number(event.target.value))}
              />
            </div>
          ) : null}
          {onRollingResistanceChange ? (
            <div className="robotics-modal-row">
              <label htmlFor="rolling-resistance">Rolling resistance</label>
              <input
                id="rolling-resistance"
                type="number"
                min={0}
                max={20}
                step={0.2}
                value={Number(rollingResistance ?? 4.2)}
                onChange={(event) => onRollingResistanceChange(Number(event.target.value))}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
