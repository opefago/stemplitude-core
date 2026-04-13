import {
  ArrowUp,
  Crosshair,
  Eye,
  Lock,
  Minus,
  MoveVertical,
  Plus,
  RotateCcw,
  Unlock,
  Video,
} from "lucide-react";

interface Props {
  mode: string;
  onModeChange: (mode: string) => void;
  onReset: () => void;
  onFocusRobot: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  lockFollowHeading: boolean;
  onToggleFollowHeading: () => void;
}

const MODES = [
  { id: "top", label: "Top", Icon: ArrowUp },
  { id: "follow", label: "Follow", Icon: Video },
  { id: "perspective", label: "Perspective", Icon: Eye },
] as const;

export function CameraToolbar({
  mode,
  onModeChange,
  onReset,
  onFocusRobot,
  onZoomIn,
  onZoomOut,
  lockFollowHeading,
  onToggleFollowHeading,
}: Props) {
  return (
    <div className="robotics-floating-group robotics-camera-toolbar">
      <div className="robotics-camera-segment">
        <button
          className={`robotics-lab-btn robotics-lab-btn--icon${mode === "top" ? " active" : ""}`}
          onClick={() => onModeChange("top")}
          title="Top"
        >
          <ArrowUp size={14} /> Top
        </button>
        <button
          className={`robotics-lab-btn robotics-lab-btn--icon${mode === "follow" ? " active" : ""}`}
          onClick={() => onModeChange("follow")}
          title="Follow"
        >
          <Video size={14} /> Follow
        </button>
      </div>
      <div className="robotics-camera-actions">
        <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={onReset} title="Reset camera">
          <RotateCcw size={14} /> Reset
        </button>
        <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={onFocusRobot} title="Focus robot">
          <Crosshair size={14} /> Focus
        </button>
      </div>
      <div className="robotics-camera-actions">
        <button
          className={`robotics-lab-btn robotics-lab-btn--icon${mode === "perspective" ? " active" : ""}`}
          onClick={() => onModeChange("perspective")}
          title="Perspective"
        >
          <Eye size={14} /> Perspective
        </button>
      </div>
      <div className="robotics-camera-actions">
        <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={onZoomIn} title="Zoom in">
          <Plus size={14} />
        </button>
        <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={onZoomOut} title="Zoom out">
          <Minus size={14} />
        </button>
      </div>
      {mode === "follow" && (
        <div className="robotics-camera-actions">
          <button
            className={`robotics-lab-btn robotics-lab-btn--icon${lockFollowHeading ? " active" : ""}`}
            onClick={onToggleFollowHeading}
            title={lockFollowHeading ? "Unlock heading" : "Lock heading"}
          >
            {lockFollowHeading ? <Lock size={14} /> : <Unlock size={14} />}
            {lockFollowHeading ? " Locked" : " Free"}
          </button>
        </div>
      )}
    </div>
  );
}
