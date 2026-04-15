import { Check, ChevronDown, Compass, Footprints, Grid3x3, Radio, Route, Ruler, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeasurementLabelSize } from "../../../labs/robotics/view/types";

interface OverlayState {
  showGrid: boolean;
  showSensors: boolean;
  showPathTrail: boolean;
  showHeading: boolean;
  showRobotFootprint: boolean;
  showMeasurements: boolean;
  showMeasurementLabels: boolean;
  showTurnAngles: boolean;
  showTurnArcs: boolean;
  showMeasurementHeading: boolean;
  showMeasurementGuides: boolean;
  measurementLabelSize: MeasurementLabelSize;
}

interface Props {
  overlays: OverlayState;
  onToggle: (key: keyof OverlayState) => void;
  onSetMeasurementLabelSize: (size: MeasurementLabelSize) => void;
}

const TOGGLES = [
  { key: "showGrid" as const, label: "Grid", Icon: Grid3x3 },
  { key: "showSensors" as const, label: "Sensors", Icon: Radio },
  { key: "showPathTrail" as const, label: "Trail", Icon: Route },
  { key: "showHeading" as const, label: "Heading", Icon: Compass },
  { key: "showRobotFootprint" as const, label: "Footprint", Icon: Footprints },
];

const LABEL_SIZE_OPTIONS: Array<{ value: MeasurementLabelSize; label: string }> = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "xl", label: "XL" },
];

export function OverlayToggles({ overlays, onToggle, onSetMeasurementLabelSize }: Props) {
  const [measurementMenuOpen, setMeasurementMenuOpen] = useState(false);
  const measurementMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!measurementMenuOpen) return;
    const onWindowPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!measurementMenuRef.current || !target) return;
      if (measurementMenuRef.current.contains(target)) return;
      setMeasurementMenuOpen(false);
    };
    window.addEventListener("mousedown", onWindowPointerDown);
    return () => window.removeEventListener("mousedown", onWindowPointerDown);
  }, [measurementMenuOpen]);

  const MEASUREMENT_OPTIONS = [
    { key: "showMeasurementLabels" as const, label: "Distances", Icon: Ruler },
    { key: "showTurnAngles" as const, label: "Angles", Icon: RotateCw },
    { key: "showTurnArcs" as const, label: "Turn Arcs", Icon: RotateCw },
    { key: "showMeasurementHeading" as const, label: "Meas Heading", Icon: Compass },
    { key: "showMeasurementGuides" as const, label: "Dim Guides", Icon: Ruler },
  ];

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
      <div ref={measurementMenuRef} className="robotics-overlay-measure-split">
        <button
          className={`robotics-lab-btn robotics-lab-btn--icon${overlays.showMeasurements ? " active" : ""}`}
          onClick={() => onToggle("showMeasurements")}
          title="Measure"
        >
          <Ruler size={14} /> Measure
        </button>
        <button
          className={`robotics-lab-btn robotics-lab-btn--icon robotics-overlay-measure-split-toggle${
            measurementMenuOpen || overlays.showMeasurements ? " active" : ""
          }`}
          aria-label="Open measurement options"
          onClick={() => setMeasurementMenuOpen((prev) => !prev)}
        >
          <ChevronDown size={14} />
        </button>
        {measurementMenuOpen ? (
          <div className="robotics-overlay-measure-menu">
            {MEASUREMENT_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`robotics-overlay-measure-menu-item${overlays[key] ? " is-checked" : ""}`}
                onClick={() => onToggle(key)}
              >
                <span className="robotics-overlay-measure-menu-item__left">
                  <Icon size={13} />
                  {label}
                </span>
                {overlays[key] ? <Check size={13} /> : <span className="robotics-overlay-measure-menu-item__empty" />}
              </button>
            ))}
            <div className="robotics-overlay-measure-size-row">
              <span className="robotics-overlay-measure-size-label">Label size</span>
              <div className="robotics-overlay-measure-size-options">
                {LABEL_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`robotics-overlay-measure-size-btn${
                      overlays.measurementLabelSize === option.value ? " is-active" : ""
                    }`}
                    onClick={() => onSetMeasurementLabelSize(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
