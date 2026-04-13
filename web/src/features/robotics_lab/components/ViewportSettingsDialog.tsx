import { X } from "lucide-react";

interface ViewportSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
}

const BG_PRESETS = ["#f7f8fa", "#f4f6f8", "#f1f3f5", "#eef1f4", "#eceff3"];

export function ViewportSettingsDialog({
  open,
  onClose,
  backgroundColor,
  onBackgroundColorChange,
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
        </div>
      </div>
    </div>
  );
}
