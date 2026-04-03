import type * as PIXI from "pixi.js";

export type Point = { x: number; y: number };

export type AnchorRole =
  | "terminal"
  | "control"
  | "power"
  | "ground"
  | "logic"
  | "probe";

export type Anchor = {
  id: string;
  x: number;
  y: number;
  role: AnchorRole;
  visible?: boolean;
};

export type ElectricalTerminal = {
  anchorId: string;
  terminalName: string;
  terminalIndex: number;
};

export type ComponentState = Record<string, unknown>;

export type SimulationStyleState = {
  active?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  voltageLevel?: number;
  currentMagnitude?: number;
  currentDirection?: 1 | -1 | 0;
  conductionState?:
    | "on"
    | "off"
    | "linear"
    | "saturation"
    | "cutoff"
    | "unknown";
};

export type ComponentLimits = {
  maxVoltage?: number;
  maxReverseVoltage?: number;
  maxForwardVoltage?: number;
  maxCurrent?: number;
  maxPower?: number;
  maxTemperatureC?: number;
  maxVgs?: number;
  maxVds?: number;
  maxVce?: number;
};

export type PartStyle = {
  stroke?: number;
  fill?: number;
  lineWidth?: number;
  alpha?: number;
};

export type SymbolPartBase = {
  id: string;
  visibleWhen?: (state: ComponentState) => boolean;
  styleWhen?: (state: ComponentState) => Partial<PartStyle>;
};

export type PathPart = SymbolPartBase & {
  kind: "path";
  d: string;
  stroke?: number;
  fill?: number;
  lineWidth?: number;
};

export type LinePart = SymbolPartBase & {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: number;
  lineWidth?: number;
};

export type CirclePart = SymbolPartBase & {
  kind: "circle";
  x: number;
  y: number;
  r: number;
  stroke?: number;
  fill?: number;
  lineWidth?: number;
};

export type RectPart = SymbolPartBase & {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: number;
  fill?: number;
  lineWidth?: number;
};

export type TextPart = SymbolPartBase & {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fill?: number;
};

export type SymbolPart =
  | PathPart
  | LinePart
  | CirclePart
  | RectPart
  | TextPart;

export type PixiSymbolContext = {
  graphics: PIXI.Graphics;
  state: ComponentState;
  styleState: SimulationStyleState;
  limits?: ComponentLimits;
};

export type ComponentDefinition = {
  type: string;
  category: string;
  size: { width: number; height: number };
  anchors: Anchor[];
  terminals: ElectricalTerminal[];
  parts?: SymbolPart[];
  svgPreview?: string;
  defaultState?: ComponentState;
  limits?: ComponentLimits;
  drawPixi?: (ctx: PixiSymbolContext) => void;
  getConnectivity?: (state: ComponentState) => Array<[string, string]>;
  toNetlist: (
    instance: ComponentInstance,
    nodeMap: Record<string, string>
  ) => string | string[];
};

export type ComponentInstance = {
  id: string;
  type: string;
  position: Point;
  rotation: 0 | 90 | 180 | 270;
  flipped?: boolean;
  props: Record<string, unknown>;
  state: ComponentState;
};

export function rotatePoint(
  p: Point,
  angle: 0 | 90 | 180 | 270,
  center: Point = { x: 50, y: 50 }
): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  switch (angle) {
    case 0:
      return { x: center.x + dx, y: center.y + dy };
    case 90:
      return { x: center.x - dy, y: center.y + dx };
    case 180:
      return { x: center.x - dx, y: center.y - dy };
    case 270:
      return { x: center.x + dy, y: center.y - dx };
  }
}
