import { X } from "lucide-react";

interface ViewportSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  moveCollisionPolicy: string;
  onMoveCollisionPolicyChange: (policy: string) => void;
}

const BG_PRESETS = ["#f7f8fa", "#f4f6f8", "#f1f3f5", "#eef1f4", "#eceff3"];

export function ViewportSettingsDialog({
  open,
  onClose,
  backgroundColor,
  onBackgroundColorChange,
  moveCollisionPolicy,
  onMoveCollisionPolicyChange,
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
        </div>
      </div>
    </div>
  );
}
