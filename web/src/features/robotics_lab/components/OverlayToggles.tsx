import { Compass, Footprints, Grid3x3, Radio, Route } from "lucide-react";

interface OverlayState {
  showGrid: boolean;
  showSensors: boolean;
  showPathTrail: boolean;
  showHeading: boolean;
  showRobotFootprint: boolean;
}

interface Props {
  overlays: OverlayState;
  onToggle: (key: keyof OverlayState) => void;
}

const TOGGLES = [
  { key: "showGrid" as const, label: "Grid", Icon: Grid3x3 },
  { key: "showSensors" as const, label: "Sensors", Icon: Radio },
  { key: "showPathTrail" as const, label: "Trail", Icon: Route },
  { key: "showHeading" as const, label: "Heading", Icon: Compass },
  { key: "showRobotFootprint" as const, label: "Footprint", Icon: Footprints },
];

export function OverlayToggles({ overlays, onToggle }: Props) {
  return (
    <div className="robotics-floating-group robotics-overlay-toggles">
      {TOGGLES.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`robotics-lab-btn robotics-lab-btn--icon${overlays[key] ? " active" : ""}`}
          onClick={() => onToggle(key)}
          title={label}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
