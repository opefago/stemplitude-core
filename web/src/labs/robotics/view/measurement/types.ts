export type DistanceUnit = "cm" | "m" | "in" | "tiles";

export type OverlayMode = "instructional" | "continuous";
export type MeasurementLabelSize = "small" | "medium" | "large" | "xl";

export interface MeasurementPose {
  x: number;
  z: number;
  headingDeg: number;
  y?: number;
}

export interface PathSample {
  id: string;
  timestampMs: number;
  position: { x: number; y: number; z: number };
  headingDeg: number;
}

export interface PathSegment {
  id: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  distanceCm: number;
  headingStartDeg: number;
  headingEndDeg: number;
  label: string;
  sampleCount: number;
}

export interface TurnMarker {
  id: string;
  position: { x: number; y: number; z: number };
  fromHeadingDeg: number;
  toHeadingDeg: number;
  angleDeg: number;
  label: string;
  arcRadiusCm: number;
}

export interface MeasurementSummary {
  totalDistanceCm: number;
  totalDistanceLabel: string;
  segmentCount: number;
  turnCount: number;
}

export interface MeasurementOverlayConfig {
  enabled: boolean;
  mode: OverlayMode;
  distanceUnit: DistanceUnit;
  gridCellCm: number;
  showSegmentLabels: boolean;
  showTurnLabels: boolean;
  showTurnArcs: boolean;
  showDimensionGuides: boolean;
  showStartMarker: boolean;
  showEndMarker: boolean;
  showTotalDistance: boolean;
  showHeadingMarker: boolean;
  turnAngleThresholdDeg: number;
  minSampleDistanceCm: number;
  minSegmentDistanceCm: number;
  lineElevation: number;
  labelElevation: number;
  labelSize: MeasurementLabelSize;
  markerElevation: number;
  maxLabelCount: number;
}

export interface MeasurementOverlayState {
  running: boolean;
  mode: OverlayMode;
  startMarker: { x: number; y: number; z: number } | null;
  endMarker: { x: number; y: number; z: number } | null;
  activeSegment: PathSegment | null;
  segments: PathSegment[];
  turns: TurnMarker[];
  samples: PathSample[];
  summary: MeasurementSummary;
}

export const DEFAULT_MEASUREMENT_OVERLAY_CONFIG: MeasurementOverlayConfig = {
  enabled: true,
  mode: "instructional",
  distanceUnit: "cm",
  gridCellCm: 20,
  showSegmentLabels: true,
  showTurnLabels: true,
  showTurnArcs: true,
  showDimensionGuides: true,
  showStartMarker: true,
  showEndMarker: true,
  showTotalDistance: true,
  showHeadingMarker: false,
  turnAngleThresholdDeg: 10,
  minSampleDistanceCm: 0.4,
  minSegmentDistanceCm: 3,
  lineElevation: 1.05,
  labelElevation: 6,
  labelSize: "large",
  markerElevation: 1.1,
  maxLabelCount: 60,
};

